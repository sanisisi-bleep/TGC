import json
from typing import List, Optional

from app.models import Card, Deck, DeckCard, DeckConsideringCard, DeckEggCard, DeckVersion, DeckZoneCard
from app.services.deck_service_payloads import DeckServicePayloadMixin
from app.services.deck_service_queries import DeckServiceQueryMixin
from app.services.deck_service_rules import DeckServiceRulesMixin
from app.services.game_rules import get_tcg_rules


DECK_HISTORY_VERSION_LIMIT = 60
DECK_HISTORY_SOURCE_LABELS = {
    "create": "Creacion",
    "import": "Importacion",
    "rename": "Renombrado",
    "clone": "Clonado",
    "add-card": "Carta anadida",
    "adjust-card": "Cantidad actualizada",
    "add-considering": "Considering actualizado",
    "adjust-considering": "Considering actualizado",
    "move-to-considering": "Carta movida a considering",
    "move-from-considering": "Carta recuperada de considering",
    "set-chosen-champion": "Chosen Champion actualizado",
    "checkpoint": "Checkpoint manual",
}


class DeckService(DeckServicePayloadMixin, DeckServiceRulesMixin, DeckServiceQueryMixin):
    def __init__(self, db):
        self.db = db

    def _build_deck_snapshot_payload(self, deck: Deck) -> dict:
        deck_tgc, rules = self._get_rules_for_deck(deck)
        payload = self._serialize_deck_payload(deck, deck_tgc, rules)
        payload["history_source"] = None
        return payload

    def _serialize_snapshot_data(self, payload: dict) -> str:
        return json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)

    def _parse_snapshot_data(self, snapshot_data: str) -> dict:
        return json.loads(snapshot_data or "{}")

    def _get_latest_deck_version(self, deck_id: int) -> Optional[DeckVersion]:
        return (
            self.db.query(DeckVersion)
            .filter(DeckVersion.deck_id == deck_id)
            .order_by(DeckVersion.version_number.desc(), DeckVersion.id.desc())
            .first()
        )

    def _prune_deck_versions(self, deck_id: int, keep_latest: int = DECK_HISTORY_VERSION_LIMIT):
        stale_versions = (
            self.db.query(DeckVersion)
            .filter(DeckVersion.deck_id == deck_id)
            .order_by(DeckVersion.version_number.desc(), DeckVersion.id.desc())
            .offset(max(keep_latest, 0))
            .all()
        )
        for stale_version in stale_versions:
            self.db.delete(stale_version)

    def _record_deck_version(self, deck: Deck, source: str, label: Optional[str] = None, force: bool = False) -> Optional[DeckVersion]:
        snapshot_payload = self._build_deck_snapshot_payload(deck)
        snapshot_payload["history_source"] = source
        snapshot_data = self._serialize_snapshot_data(snapshot_payload)
        latest_version = self._get_latest_deck_version(deck.id)

        if not force and latest_version and latest_version.snapshot_data == snapshot_data:
            return latest_version

        version = DeckVersion(
            deck_id=deck.id,
            version_number=(latest_version.version_number if latest_version else 0) + 1,
            source=source,
            label=((label or "").strip() or None),
            snapshot_data=snapshot_data,
        )
        self.db.add(version)
        self.db.flush()
        self._prune_deck_versions(deck.id)
        return version

    def _commit_deck_version(self, deck: Deck, source: str, label: Optional[str] = None, force: bool = False):
        self._record_deck_version(deck, source, label=label, force=force)
        self.db.commit()

    def _build_deck_version_summary(self, version: DeckVersion) -> dict:
        snapshot = self._parse_snapshot_data(version.snapshot_data)
        return {
            "id": version.id,
            "deck_id": version.deck_id,
            "version_number": version.version_number,
            "source": version.source,
            "source_label": DECK_HISTORY_SOURCE_LABELS.get(version.source, version.source),
            "label": version.label,
            "created_at": version.created_at,
            "name": snapshot.get("name"),
            "tgc_name": snapshot.get("tgc_name"),
            "is_complete": bool(snapshot.get("is_complete")),
            "total_cards": int(snapshot.get("total_cards") or 0),
            "main_deck_cards": int(snapshot.get("main_deck_cards") or 0),
            "egg_total_cards": int(snapshot.get("egg_total_cards") or 0),
            "considering_total_cards": int(snapshot.get("considering_total_cards") or 0),
            "leader_cards": int(snapshot.get("leader_cards") or 0),
            "don_cards": int(snapshot.get("don_cards") or 0),
            "legend_total_cards": int(snapshot.get("legend_total_cards") or 0),
            "rune_total_cards": int(snapshot.get("rune_total_cards") or 0),
            "battlefield_total_cards": int(snapshot.get("battlefield_total_cards") or 0),
            "sideboard_total_cards": int(snapshot.get("sideboard_total_cards") or 0),
            "resource_total_cards": int(snapshot.get("resource_total_cards") or 0),
            "distinct_cards": (
                len(snapshot.get("cards") or [])
                + len(snapshot.get("egg_cards") or [])
                + len(snapshot.get("legend_cards_data") or [])
                + len(snapshot.get("rune_cards_data") or [])
                + len(snapshot.get("battlefield_cards_data") or [])
                + len(snapshot.get("sideboard_cards_data") or [])
                + len(snapshot.get("resource_cards_data") or [])
            ),
        }

    def get_deck_history(self, deck_id: int, user_id: int):
        self._get_user_deck_or_error(deck_id, user_id)
        versions = (
            self.db.query(DeckVersion)
            .filter(DeckVersion.deck_id == deck_id)
            .order_by(DeckVersion.version_number.desc(), DeckVersion.id.desc())
            .all()
        )
        return [self._build_deck_version_summary(version) for version in versions]

    def get_deck_history_version(self, deck_id: int, version_id: int, user_id: int):
        self._get_user_deck_or_error(deck_id, user_id)
        version = (
            self.db.query(DeckVersion)
            .filter(DeckVersion.deck_id == deck_id, DeckVersion.id == version_id)
            .first()
        )
        if not version:
            raise ValueError("Deck history version not found")

        return {
            **self._build_deck_version_summary(version),
            "snapshot": self._parse_snapshot_data(version.snapshot_data),
        }

    def create_deck_checkpoint(self, deck_id: int, user_id: int, label: Optional[str] = None):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        version = self._record_deck_version(deck, "checkpoint", label=label, force=True)
        self.db.commit()
        self.db.refresh(version)
        return version

    def create_deck(self, user_id: int, name: str, tgc_id: Optional[int] = None) -> Deck:
        resolved_tgc_id = tgc_id
        if resolved_tgc_id is None:
            default_tgc = self._get_default_tgc()
            resolved_tgc_id = default_tgc.id if default_tgc else None

        cleaned_name = (name or "").strip()
        if not cleaned_name:
            raise ValueError("Deck name cannot be empty")

        deck = Deck(user_id=user_id, tgc_id=resolved_tgc_id, name=cleaned_name[:100])
        self.db.add(deck)
        self.db.commit()
        self.db.refresh(deck)
        self._commit_deck_version(deck, "create")
        return deck

    def import_deck(
        self,
        user_id: int,
        name: Optional[str],
        tgc_id: Optional[int],
        cards: List[dict],
        egg_cards: Optional[List[dict]] = None,
        legend_cards: Optional[List[dict]] = None,
        rune_cards: Optional[List[dict]] = None,
        battlefield_cards: Optional[List[dict]] = None,
        sideboard_cards: Optional[List[dict]] = None,
        resource_cards: Optional[List[dict]] = None,
        chosen_champion: Optional[dict] = None,
    ):
        egg_cards = egg_cards or []
        legend_cards = legend_cards or []
        rune_cards = rune_cards or []
        battlefield_cards = battlefield_cards or []
        sideboard_cards = sideboard_cards or []
        resource_cards = resource_cards or []
        if not cards and not egg_cards and not legend_cards and not rune_cards and not battlefield_cards and not sideboard_cards and not resource_cards:
            raise ValueError("Imported deck must include at least one card")

        target_tgc = self._get_tgc_by_id(tgc_id) if tgc_id is not None else self._get_default_tgc()
        if tgc_id is not None and target_tgc is None:
            raise ValueError("Target TCG not found for imported deck")
        resolved_tgc_id = target_tgc.id if target_tgc else None
        rules = get_tcg_rules(target_tgc.name if target_tgc else None)

        aggregated_cards = {
            "main": {},
            "egg": {},
            "legend": {},
            "rune": {},
            "battlefield": {},
            "sideboard": {},
            "resource": {},
        }
        deck_entries = []
        chosen_champion_card_id = None

        for raw_card in [*cards, *egg_cards, *legend_cards, *rune_cards, *battlefield_cards, *sideboard_cards, *resource_cards]:
            quantity = int(raw_card.get("quantity") or 0)
            if quantity <= 0:
                raise ValueError("Imported card quantity must be greater than zero")

            card = self._resolve_import_card(resolved_tgc_id, raw_card)
            requested_zone = (raw_card.get("zone") or "").strip().lower()
            storage_section = self._get_card_storage_section(target_tgc, card)
            if self._is_riftbound_tgc(target_tgc) and requested_zone:
                if requested_zone == "sideboard":
                    if card.riftbound_data and (card.riftbound_data.is_legend or card.riftbound_data.is_rune or card.riftbound_data.is_battlefield):
                        raise ValueError("Legends, runes and battlefields cannot go into the Riftbound sideboard")
                    storage_section = "sideboard"
                elif requested_zone in {"legend", "rune", "battlefield"}:
                    if requested_zone != storage_section:
                        raise ValueError(f"{card.name} does not belong to the {requested_zone} zone")
                elif requested_zone != "main":
                    raise ValueError(f"Unsupported import zone: {requested_zone}")
            if self._is_gundam_tgc(target_tgc) and requested_zone:
                if requested_zone not in {"main", "resource"}:
                    raise ValueError(f"Unsupported import zone: {requested_zone}")
                if requested_zone != storage_section:
                    raise ValueError(f"{card.name} no pertenece a la zona {requested_zone}.")
            current_quantity = aggregated_cards[storage_section].get(card.id, 0)
            aggregated_cards[storage_section][card.id] = current_quantity + quantity

        if chosen_champion:
            chosen_champion_card = self._resolve_import_card(resolved_tgc_id, chosen_champion)
            chosen_champion_card_id = chosen_champion_card.id

        for storage_section in ("main", "egg", "legend", "rune", "battlefield", "sideboard", "resource"):
            for card_id, quantity in aggregated_cards[storage_section].items():
                card = self.db.query(Card).filter(Card.id == card_id).first()
                deck_entries.append(
                    {
                        "deck_item": None,
                        "card": card,
                        "quantity": quantity,
                        "storage_section": storage_section,
                    }
                )

        candidate_deck = Deck(
            user_id=user_id,
            tgc_id=resolved_tgc_id,
            name=((name or "").strip() or "Mazo importado")[:100],
            riftbound_chosen_champion_card_id=chosen_champion_card_id,
        )

        self._validate_deck_composition(
            target_tgc,
            rules,
            deck_entries,
            deck_entries[0]["card"] if deck_entries else None,
            require_complete=True,
            deck=candidate_deck,
        )

        deck_name = (name or "").strip() or "Mazo importado"
        deck = Deck(
            user_id=user_id,
            tgc_id=resolved_tgc_id,
            name=deck_name[:100],
            riftbound_chosen_champion_card_id=chosen_champion_card_id,
        )
        self.db.add(deck)
        self.db.flush()

        for entry in deck_entries:
            if entry["storage_section"] == "egg":
                model_class = DeckEggCard
            elif entry["storage_section"] in {"legend", "rune", "battlefield", "sideboard", "resource"}:
                model_class = DeckZoneCard
            else:
                model_class = DeckCard
            self.db.add(
                model_class(
                    deck_id=deck.id,
                    card_id=entry["card"].id,
                    quantity=entry["quantity"],
                    **({"zone": entry["storage_section"]} if model_class is DeckZoneCard else {}),
                )
            )

        self.db.commit()
        self.db.refresh(deck)
        self._commit_deck_version(deck, "import")
        return deck

    def rename_deck(self, deck_id: int, user_id: int, name: str):
        deck = self._get_user_deck_or_error(deck_id, user_id)

        cleaned_name = (name or "").strip()
        if not cleaned_name:
            raise ValueError("Deck name cannot be empty")

        deck.name = cleaned_name[:100]
        self.db.commit()
        self.db.refresh(deck)
        self._commit_deck_version(deck, "rename")
        return deck

    def delete_deck(self, deck_id: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)

        self.db.query(DeckCard).filter(DeckCard.deck_id == deck.id).delete(synchronize_session=False)
        self.db.query(DeckEggCard).filter(DeckEggCard.deck_id == deck.id).delete(synchronize_session=False)
        self.db.query(DeckZoneCard).filter(DeckZoneCard.deck_id == deck.id).delete(synchronize_session=False)
        self.db.query(DeckConsideringCard).filter(DeckConsideringCard.deck_id == deck.id).delete(synchronize_session=False)
        self.db.query(DeckVersion).filter(DeckVersion.deck_id == deck.id).delete(synchronize_session=False)
        self.db.delete(deck)
        self.db.commit()
        return deck

    def clone_deck(self, deck_id: int, user_id: int):
        source_deck = self._get_user_deck_or_error(deck_id, user_id)

        cloned_deck = Deck(
            user_id=user_id,
            tgc_id=source_deck.tgc_id,
            name=f"{source_deck.name} (Copia)",
            riftbound_chosen_champion_card_id=source_deck.riftbound_chosen_champion_card_id,
        )
        self.db.add(cloned_deck)
        self.db.flush()

        source_cards = self.db.query(DeckCard).filter(DeckCard.deck_id == source_deck.id).all()
        for source_card in source_cards:
            self.db.add(
                DeckCard(
                    deck_id=cloned_deck.id,
                    card_id=source_card.card_id,
                    quantity=source_card.quantity,
                    assigned_quantity=None,
                )
            )

        source_egg_cards = self.db.query(DeckEggCard).filter(DeckEggCard.deck_id == source_deck.id).all()
        for source_card in source_egg_cards:
            self.db.add(
                DeckEggCard(
                    deck_id=cloned_deck.id,
                    card_id=source_card.card_id,
                    quantity=source_card.quantity,
                    assigned_quantity=None,
                )
            )

        source_zone_cards = self.db.query(DeckZoneCard).filter(DeckZoneCard.deck_id == source_deck.id).all()
        for source_card in source_zone_cards:
            self.db.add(
                DeckZoneCard(
                    deck_id=cloned_deck.id,
                    card_id=source_card.card_id,
                    zone=source_card.zone,
                    quantity=source_card.quantity,
                    assigned_quantity=None,
                )
            )

        source_considering_cards = (
            self.db.query(DeckConsideringCard)
            .filter(DeckConsideringCard.deck_id == source_deck.id)
            .all()
        )
        for source_card in source_considering_cards:
            self.db.add(
                DeckConsideringCard(
                    deck_id=cloned_deck.id,
                    card_id=source_card.card_id,
                    quantity=source_card.quantity,
                )
            )

        self.db.commit()
        self.db.refresh(cloned_deck)
        self._commit_deck_version(cloned_deck, "clone")
        return cloned_deck

    def ensure_share_token(self, deck_id: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)

        if not deck.share_token:
            deck.share_token = self._generate_share_token()
            self.db.commit()
            self.db.refresh(deck)

        return deck

    def add_card_to_deck(self, deck_id: int, card_id: int, quantity: int, user_id: int, zone: Optional[str] = None):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)

        if quantity <= 0:
            raise ValueError("Quantity must be greater than zero")

        card = self.db.query(Card).filter(Card.id == card_id).first()
        if not card:
            raise ValueError("Card not found")

        if card.tgc_id != (deck_tgc.id if deck_tgc else card.tgc_id):
            raise ValueError("Card belongs to a different TCG")

        storage_section = self._get_card_storage_section(deck_tgc, card)
        requested_zone = (zone or "").strip().lower()
        if self._is_gundam_tgc(deck_tgc) and requested_zone:
            if requested_zone not in {"main", "resource"}:
                raise ValueError(f"Unsupported Gundam zone: {requested_zone}")
            if requested_zone != storage_section:
                raise ValueError(f"{card.name} no pertenece a la zona {requested_zone}.")
        if self._is_riftbound_tgc(deck_tgc):
            if requested_zone == "sideboard":
                if card.riftbound_data and (card.riftbound_data.is_legend or card.riftbound_data.is_rune or card.riftbound_data.is_battlefield):
                    raise ValueError("Legends, runes and battlefields cannot go into the Riftbound sideboard")
                storage_section = "sideboard"
            elif requested_zone in {"legend", "rune", "battlefield"} and requested_zone != storage_section:
                raise ValueError(f"{card.name} does not belong to the {requested_zone} zone")
        deck_card = self._get_storage_card_record(deck_id, card_id, storage_section)
        current_quantity = deck_card.quantity if deck_card else 0
        next_quantity = current_quantity + quantity
        total_cards_in_deck = self._get_storage_total_quantity(deck_id, storage_section)
        next_total = total_cards_in_deck - current_quantity + next_quantity

        self._validate_generic_quantity_rules(deck_tgc, rules, next_quantity, next_total, card)
        candidate_entries = self._build_candidate_deck_entries(deck_tgc, deck_id, card, next_quantity)
        self._validate_deck_composition(deck_tgc, rules, candidate_entries, card, is_increase=True, deck=deck)

        if deck_card:
            deck_card.quantity = next_quantity
            if deck_card.assigned_quantity is not None:
                deck_card.assigned_quantity = min(deck_card.assigned_quantity, deck_card.quantity)
        else:
            if storage_section == "egg":
                model_class = DeckEggCard
                deck_card = model_class(deck_id=deck_id, card_id=card_id, quantity=quantity)
            elif storage_section in {"legend", "rune", "battlefield", "sideboard", "resource"}:
                model_class = DeckZoneCard
                deck_card = model_class(deck_id=deck_id, card_id=card_id, zone=storage_section, quantity=quantity)
            else:
                model_class = DeckCard
                deck_card = model_class(deck_id=deck_id, card_id=card_id, quantity=quantity)
            self.db.add(deck_card)

        self.db.commit()
        self.db.refresh(deck_card)
        self._commit_deck_version(deck, "add-card")
        return {
            "quantity": deck_card.quantity,
            "assigned_quantity": deck_card.assigned_quantity,
            "deck_section": storage_section,
        }

    def add_card_to_considering(self, deck_id: int, card_id: int, quantity: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)

        if quantity <= 0:
            raise ValueError("Quantity must be greater than zero")

        card = self.db.query(Card).filter(Card.id == card_id).first()
        if not card:
            raise ValueError("Card not found")

        if card.tgc_id != (deck_tgc.id if deck_tgc else card.tgc_id):
            raise ValueError("Card belongs to a different TCG")

        considering_card = (
            self.db.query(DeckConsideringCard)
            .filter(DeckConsideringCard.deck_id == deck_id, DeckConsideringCard.card_id == card_id)
            .first()
        )
        current_quantity = considering_card.quantity if considering_card else 0
        next_quantity = current_quantity + quantity
        self._validate_considering_quantity_rules(deck_tgc, rules, next_quantity, card)

        if considering_card:
            considering_card.quantity = next_quantity
        else:
            considering_card = DeckConsideringCard(deck_id=deck_id, card_id=card_id, quantity=quantity)
            self.db.add(considering_card)

        self.db.commit()
        self.db.refresh(considering_card)
        self._commit_deck_version(deck, "add-considering")
        return {"quantity": considering_card.quantity}

    def adjust_considering_card_quantity(self, deck_id: int, card_id: int, delta: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)
        considering_card = self._get_deck_considering_card_or_error(deck_id, card_id)
        card = self.db.query(Card).filter(Card.id == card_id).first()

        next_quantity = considering_card.quantity + delta
        if next_quantity > 0:
            self._validate_considering_quantity_rules(deck_tgc, rules, next_quantity, card)

        if next_quantity <= 0:
            self.db.delete(considering_card)
            self.db.commit()
            self._commit_deck_version(deck, "adjust-considering")
            return {"quantity": 0}

        considering_card.quantity = next_quantity
        self.db.commit()
        self.db.refresh(considering_card)
        self._commit_deck_version(deck, "adjust-considering")
        return {"quantity": considering_card.quantity}

    def move_card_to_considering(self, deck_id: int, card_id: int, quantity: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)
        storage_section, deck_card = self._get_any_deck_card_or_error(deck_id, card_id)

        if quantity <= 0:
            raise ValueError("Quantity must be greater than zero")
        if quantity > deck_card.quantity:
            raise ValueError("Not enough copies in deck to move")

        card = self.db.query(Card).filter(Card.id == card_id).first()
        considering_card = (
            self.db.query(DeckConsideringCard)
            .filter(DeckConsideringCard.deck_id == deck_id, DeckConsideringCard.card_id == card_id)
            .first()
        )
        current_considering_quantity = considering_card.quantity if considering_card else 0
        next_considering_quantity = current_considering_quantity + quantity
        self._validate_considering_quantity_rules(deck_tgc, rules, next_considering_quantity, card)

        if considering_card:
            considering_card.quantity = next_considering_quantity
        else:
            considering_card = DeckConsideringCard(deck_id=deck_id, card_id=card_id, quantity=quantity)
            self.db.add(considering_card)

        next_deck_quantity = deck_card.quantity - quantity
        if next_deck_quantity <= 0:
            self.db.delete(deck_card)
            assigned_quantity = None
        else:
            deck_card.quantity = next_deck_quantity
            if deck_card.assigned_quantity is not None:
                deck_card.assigned_quantity = min(deck_card.assigned_quantity, deck_card.quantity)
            assigned_quantity = deck_card.assigned_quantity

        self.db.commit()
        self.db.refresh(considering_card)
        self._commit_deck_version(deck, "move-to-considering")
        return {
            "deck_quantity": max(next_deck_quantity, 0),
            "deck_section": storage_section,
            "considering_quantity": considering_card.quantity,
            "assigned_quantity": assigned_quantity,
        }

    def move_card_from_considering_to_deck(self, deck_id: int, card_id: int, quantity: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)
        considering_card = self._get_deck_considering_card_or_error(deck_id, card_id)

        if quantity <= 0:
            raise ValueError("Quantity must be greater than zero")
        if quantity > considering_card.quantity:
            raise ValueError("Not enough copies in considering to move")

        card = self.db.query(Card).filter(Card.id == card_id).first()
        storage_section = self._get_card_storage_section(deck_tgc, card)
        deck_card = self._get_storage_card_record(deck_id, card_id, storage_section)
        current_quantity = deck_card.quantity if deck_card else 0
        next_quantity = current_quantity + quantity
        total_cards_in_deck = self._get_storage_total_quantity(deck_id, storage_section)
        next_total = total_cards_in_deck - current_quantity + next_quantity

        self._validate_generic_quantity_rules(deck_tgc, rules, next_quantity, next_total, card)
        candidate_entries = self._build_candidate_deck_entries(deck_tgc, deck_id, card, next_quantity)
        self._validate_deck_composition(deck_tgc, rules, candidate_entries, card, is_increase=True, deck=deck)

        if deck_card:
            deck_card.quantity = next_quantity
        else:
            if storage_section == "egg":
                model_class = DeckEggCard
                deck_card = model_class(deck_id=deck_id, card_id=card_id, quantity=quantity)
            elif storage_section in {"legend", "rune", "battlefield", "sideboard", "resource"}:
                model_class = DeckZoneCard
                deck_card = model_class(deck_id=deck_id, card_id=card_id, zone=storage_section, quantity=quantity)
            else:
                model_class = DeckCard
                deck_card = model_class(deck_id=deck_id, card_id=card_id, quantity=quantity)
            self.db.add(deck_card)

        next_considering_quantity = considering_card.quantity - quantity
        if next_considering_quantity <= 0:
            self.db.delete(considering_card)
            considering_quantity = 0
        else:
            considering_card.quantity = next_considering_quantity
            considering_quantity = considering_card.quantity

        self.db.commit()
        self.db.refresh(deck_card)
        self._commit_deck_version(deck, "move-from-considering")
        return {
            "deck_quantity": deck_card.quantity,
            "deck_section": storage_section,
            "considering_quantity": considering_quantity,
            "assigned_quantity": deck_card.assigned_quantity,
        }

    def adjust_deck_card_quantity(self, deck_id: int, card_id: int, delta: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)
        storage_section, deck_card = self._get_any_deck_card_or_error(deck_id, card_id)
        card = self.db.query(Card).filter(Card.id == card_id).first()

        next_quantity = deck_card.quantity + delta
        total_cards_in_deck = self._get_storage_total_quantity(deck_id, storage_section)
        next_total = total_cards_in_deck - deck_card.quantity + max(next_quantity, 0)

        if next_quantity > 0:
            self._validate_generic_quantity_rules(deck_tgc, rules, next_quantity, next_total, card)

        candidate_entries = self._build_candidate_deck_entries(deck_tgc, deck_id, card, max(next_quantity, 0))
        composition = self._validate_deck_composition(
            deck_tgc,
            rules,
            candidate_entries,
            card,
            is_increase=delta > 0,
            deck=deck,
        )
        candidate_total_cards = sum(entry["quantity"] for entry in candidate_entries)
        deck_overview = self._build_deck_response_base(
            deck,
            deck_tgc,
            rules,
            composition,
            candidate_total_cards,
        )

        if next_quantity <= 0:
            self.db.delete(deck_card)
            self.db.commit()
            self._commit_deck_version(deck, "adjust-card")
            return {
                "quantity": 0,
                "deck_section": storage_section,
                "assigned_quantity": None,
                "deck": deck_overview,
            }

        deck_card.quantity = next_quantity
        if deck_card.assigned_quantity is not None:
            deck_card.assigned_quantity = min(deck_card.assigned_quantity, deck_card.quantity)
        self.db.commit()
        self.db.refresh(deck_card)
        self._commit_deck_version(deck, "adjust-card")
        return {
            "quantity": deck_card.quantity,
            "deck_section": storage_section,
            "assigned_quantity": deck_card.assigned_quantity,
            "deck": deck_overview,
        }

    def adjust_deck_card_assignment(self, deck_id: int, card_id: int, delta: int, user_id: int):
        self._get_user_deck_or_error(deck_id, user_id)
        storage_section, deck_card = self._get_any_deck_card_or_error(deck_id, card_id)

        owned_quantity = self._get_owned_quantity(user_id, card_id)
        max_coverable_quantity = min(deck_card.quantity, owned_quantity)
        current_assignment = (
            deck_card.assigned_quantity
            if deck_card.assigned_quantity is not None
            else max_coverable_quantity
        )
        next_assignment = max(min(current_assignment + delta, max_coverable_quantity), 0)

        if next_assignment == max_coverable_quantity:
            deck_card.assigned_quantity = None
        else:
            deck_card.assigned_quantity = next_assignment

        self.db.commit()
        self.db.refresh(deck_card)
        return {
            "quantity": deck_card.quantity,
            "deck_section": storage_section,
            "assigned_quantity": deck_card.assigned_quantity,
        }

    def set_riftbound_chosen_champion(self, deck_id: int, user_id: int, card_id: Optional[int]):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)

        if not self._is_riftbound_tgc(deck_tgc):
            raise ValueError("Chosen Champion is only available for Riftbound decks")

        chosen_card = None
        if card_id is not None:
            storage_section, deck_card = self._get_any_deck_card_or_error(deck_id, card_id)
            if storage_section != "main":
                raise ValueError("The Chosen Champion must belong to the Main Deck")

            chosen_card = self.db.query(Card).filter(Card.id == card_id).first()
            if not chosen_card or not chosen_card.riftbound_data or not chosen_card.riftbound_data.is_champion:
                raise ValueError("The Chosen Champion must be a Riftbound champion unit")

            candidate_entries = self._get_playable_entries(deck_id)
            original_card_id = deck.riftbound_chosen_champion_card_id
            deck.riftbound_chosen_champion_card_id = card_id
            try:
                self._validate_deck_composition(
                    deck_tgc,
                    rules,
                    candidate_entries,
                    chosen_card,
                    require_complete=False,
                    deck=deck,
                )
            except Exception:
                deck.riftbound_chosen_champion_card_id = original_card_id
                raise

        deck.riftbound_chosen_champion_card_id = card_id
        self.db.commit()
        self.db.refresh(deck)
        self._commit_deck_version(deck, "set-chosen-champion")
        return {
            "chosen_champion_card_id": deck.riftbound_chosen_champion_card_id,
            "deck_section": "main",
            "card_id": chosen_card.id if chosen_card else None,
        }
