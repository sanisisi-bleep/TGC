from typing import Optional

from sqlalchemy import or_

from app.models import Card, Deck, DeckConsideringCard
from app.services.game_rules import DEFAULT_RULES, GUNDAM_TCG_NAME, get_tcg_rules
from app.services.image_service import resolve_card_image_url


class DeckServicePayloadMixin:
    def _resolve_card_image_url(self, deck_tgc, card: Card):
        return resolve_card_image_url(
            card.image_url,
            source_card_id=card.source_card_id,
            tgc_name=deck_tgc.name if deck_tgc else None,
        )

    def _serialize_playable_deck_card(
        self,
        deck_tgc,
        rules: dict,
        deck_item,
        card: Card,
        composition: dict,
        storage_section: str,
        chosen_champion_card_id: Optional[int] = None,
    ):
        role = self._get_card_role(deck_tgc, card)
        card_colors = self._get_card_colors(deck_tgc, card)
        color_matches_rule = True
        color_warning_text = ""

        if self._is_one_piece_tgc(deck_tgc):
            leader_colors = set(composition.get("leader_color_labels") or [])
            if role == "main" and leader_colors:
                color_matches_rule = not leader_colors.isdisjoint(card_colors)
                if not color_matches_rule:
                    color_warning_text = "Fuera de color con el Leader"
        elif self._is_gundam_tgc(deck_tgc):
            deck_colors = set(composition.get("deck_color_labels") or [])
            if deck_colors and card_colors and not card_colors.issubset(deck_colors):
                color_matches_rule = False
                color_warning_text = "Fuera de los colores fijados del mazo"
        elif self._is_riftbound_tgc(deck_tgc):
            legend_domains = set(composition.get("domain_labels") or [])
            if storage_section in {"main", "rune"} and legend_domains and card_colors and not card_colors.issubset(legend_domains):
                color_matches_rule = False
                color_warning_text = "Fuera de los domains de la Legend"

        return {
            "id": card.id,
            "source_card_id": card.source_card_id,
            "deck_key": card.deck_key or card.source_card_id,
            "name": card.name,
            "image_url": self._resolve_card_image_url(deck_tgc, card),
            "card_type": card.card_type,
            "lv": card.lv,
            "cost": card.cost,
            "color": card.color,
            "rarity": card.rarity,
            "set_name": card.set_name,
            "version": card.version,
            "quantity": deck_item.quantity,
            "deck_role": role,
            "deck_section": storage_section,
            "max_quantity_allowed": self._get_card_quantity_limit(deck_tgc, rules, card),
            "color_matches_leader": color_matches_rule,
            "color_warning_text": color_warning_text,
            "is_chosen_champion": bool(chosen_champion_card_id and storage_section == "main" and card.id == chosen_champion_card_id),
            "riftbound_data": {
                "domains": card.riftbound_data.domains,
                "champion_tag": card.riftbound_data.champion_tag,
                "keywords": card.riftbound_data.keywords,
                "is_signature": bool(card.riftbound_data.is_signature),
                "is_rune": bool(card.riftbound_data.is_rune),
                "is_battlefield": bool(card.riftbound_data.is_battlefield),
                "is_legend": bool(card.riftbound_data.is_legend),
                "is_champion": bool(card.riftbound_data.is_champion),
                "legality_status": card.riftbound_data.legality_status,
            } if getattr(card, "riftbound_data", None) else None,
        }

    def _serialize_considering_card(self, deck_tgc, rules: dict, considering_card: DeckConsideringCard, card: Card):
        role = self._get_card_role(deck_tgc, card)
        return {
            "id": card.id,
            "source_card_id": card.source_card_id,
            "deck_key": card.deck_key or card.source_card_id,
            "name": card.name,
            "image_url": self._resolve_card_image_url(deck_tgc, card),
            "card_type": card.card_type,
            "lv": card.lv,
            "cost": card.cost,
            "color": card.color,
            "rarity": card.rarity,
            "set_name": card.set_name,
            "version": card.version,
            "quantity": considering_card.quantity,
            "deck_role": role,
            "deck_section": "considering",
            "max_quantity_allowed": self._get_card_quantity_limit(deck_tgc, rules, card),
            "riftbound_data": {
                "domains": card.riftbound_data.domains,
                "champion_tag": card.riftbound_data.champion_tag,
                "keywords": card.riftbound_data.keywords,
                "is_signature": bool(card.riftbound_data.is_signature),
                "is_rune": bool(card.riftbound_data.is_rune),
                "is_battlefield": bool(card.riftbound_data.is_battlefield),
                "is_legend": bool(card.riftbound_data.is_legend),
                "is_champion": bool(card.riftbound_data.is_champion),
                "legality_status": card.riftbound_data.legality_status,
            } if getattr(card, "riftbound_data", None) else None,
        }

    def _build_deck_response_base(self, deck: Deck, deck_tgc, rules: dict, composition: dict, total_cards: int):
        return {
            "id": deck.id,
            "name": deck.name,
            "tgc_id": deck_tgc.id if deck_tgc else None,
            "tgc_name": deck_tgc.name if deck_tgc else GUNDAM_TCG_NAME,
            "created_at": deck.created_at,
            "total_cards": total_cards,
            "min_cards": rules["deck_min_cards"],
            "max_cards": rules["deck_max_cards"],
            "max_copies_per_card": rules["max_copies_per_card"],
            "remaining_cards": (
                max(rules["required_main_deck_cards"] - composition["main_deck_cards"], 0)
                if self._is_riftbound_tgc(deck_tgc)
                else (
                max(rules["deck_max_cards"] - composition["main_deck_cards"], 0)
                if self._is_one_piece_tgc(deck_tgc) or self._is_digimon_tgc(deck_tgc)
                else max(rules["deck_max_cards"] - total_cards, 0)
                )
            ),
            "is_complete": composition["is_valid"],
            "composition": composition,
            "leader_cards": composition["leader_cards"],
            "required_leader_cards": composition["required_leader_cards"],
            "main_deck_cards": composition["main_deck_cards"],
            "required_main_deck_cards": composition["required_main_deck_cards"],
            "don_cards": composition["don_cards"],
            "recommended_don_cards": composition["recommended_don_cards"],
            "don_is_optional": composition["don_is_optional"],
            "egg_cards": composition.get("egg_cards", 0),
            "required_egg_cards": composition.get("required_egg_cards", 0),
            "max_egg_cards": composition.get("max_egg_cards", 0),
            "legend_cards": composition.get("legend_cards", 0),
            "required_legend_cards": composition.get("required_legend_cards", 0),
            "rune_cards": composition.get("rune_cards", 0),
            "required_rune_cards": composition.get("required_rune_cards", 0),
            "max_rune_cards": composition.get("max_rune_cards", 0),
            "battlefield_cards": composition.get("battlefield_cards", 0),
            "required_battlefield_cards": composition.get("required_battlefield_cards", 0),
            "max_battlefield_cards": composition.get("max_battlefield_cards", 0),
            "sideboard_cards": composition.get("sideboard_cards", 0),
            "max_sideboard_cards": composition.get("max_sideboard_cards", 0),
            "chosen_champion_cards": composition.get("chosen_champion_cards", 0),
            "required_chosen_champion_cards": composition.get("required_chosen_champion_cards", 0),
            "domain_labels": composition.get("domain_labels", []),
            "main_draw_pool_cards": composition.get("main_draw_pool_cards", 0),
            "leader_color_labels": composition["leader_color_labels"],
            "deck_color_labels": composition.get("deck_color_labels", []),
            "max_deck_colors": composition.get("max_deck_colors", 0),
            "off_color_cards": composition["off_color_cards"],
            "copy_limit_exceeded_cards": composition.get("copy_limit_exceeded_cards", []),
            "banned_cards": composition.get("banned_cards", []),
            "banned_battlefields": composition.get("banned_battlefields", []),
            "egg_total_cards": 0,
            "egg_unique_cards": 0,
            "legend_unique_cards": 0,
            "rune_unique_cards": 0,
            "battlefield_unique_cards": 0,
            "sideboard_unique_cards": 0,
            "considering_total_cards": 0,
            "considering_unique_cards": 0,
        }

    def _serialize_deck_summary_payload(self, deck: Deck, deck_tgc, rules: dict, playable_entries: list[dict]):
        composition = self._build_deck_composition(deck_tgc, rules, playable_entries, deck=deck)
        total_cards = sum(entry["quantity"] for entry in playable_entries)
        return self._build_deck_response_base(deck, deck_tgc, rules, composition, total_cards)

    def _get_rules_for_serialization(self, deck_tgc):
        return get_tcg_rules(deck_tgc.name if deck_tgc else None)

    def _resolve_summary_deck_tgc(self, deck: Deck, deck_tgc, playable_entries: list[dict], default_tgc=None):
        if deck_tgc and get_tcg_rules(deck_tgc.name) != DEFAULT_RULES:
            return deck_tgc

        tgc_counts: dict[int, int] = {}
        for entry in playable_entries or []:
            card = entry.get("card")
            card_tgc_id = getattr(card, "tgc_id", None)
            if card_tgc_id is None:
                continue
            tgc_counts[card_tgc_id] = tgc_counts.get(card_tgc_id, 0) + int(entry.get("quantity") or 0)

        if tgc_counts:
            inferred_tgc_id = max(
                tgc_counts.items(),
                key=lambda item: (item[1], -item[0]),
            )[0]
            inferred_tgc = self._get_tgc_by_id(inferred_tgc_id)
            if inferred_tgc:
                return inferred_tgc

        if deck_tgc:
            return deck_tgc

        return default_tgc

    def _serialize_deck_payload(self, deck: Deck, deck_tgc, rules: dict, user_id: Optional[int] = None, include_share_token: bool = False):
        deck_entries = self._get_deck_entries(deck.id)
        egg_entries = self._get_egg_entries(deck.id)
        zone_entries = self._get_zone_entries(deck.id)
        considering_entries = self._get_considering_entries(deck.id)
        playable_entries = [*deck_entries, *egg_entries, *zone_entries]
        composition = self._build_deck_composition(deck_tgc, rules, playable_entries, deck=deck)
        total_cards = sum(entry["quantity"] for entry in playable_entries)
        egg_total_cards = sum(entry["quantity"] for entry in egg_entries)
        legend_total_cards = sum(entry["quantity"] for entry in zone_entries if entry["storage_section"] == "legend")
        rune_total_cards = sum(entry["quantity"] for entry in zone_entries if entry["storage_section"] == "rune")
        battlefield_total_cards = sum(entry["quantity"] for entry in zone_entries if entry["storage_section"] == "battlefield")
        sideboard_total_cards = sum(entry["quantity"] for entry in zone_entries if entry["storage_section"] == "sideboard")
        considering_total_cards = sum(entry["quantity"] for entry in considering_entries)
        advanced_mode = self._is_advanced_mode_enabled(user_id) if user_id is not None else False
        tracked_card_ids = (
            [entry["card"].id for entry in playable_entries]
            + [entry["card"].id for entry in considering_entries]
        )
        if user_id is not None:
            owned_coverage_allocations, owned_quantities = self._get_owned_coverage_allocations(
                user_id,
                tracked_card_ids,
                advanced_mode,
            )
        else:
            owned_coverage_allocations = {}
            owned_quantities = {}

        serialized_cards = []
        serialized_egg_cards = []
        serialized_legend_cards = []
        serialized_rune_cards = []
        serialized_battlefield_cards = []
        serialized_sideboard_cards = []
        serialized_considering_cards = []
        missing_copies = 0
        chosen_champion_card_id = getattr(deck, "riftbound_chosen_champion_card_id", None)

        for entry in deck_entries:
            deck_item = entry["deck_item"]
            card = entry["card"]
            base_payload = self._serialize_playable_deck_card(
                deck_tgc,
                rules,
                deck_item,
                card,
                composition,
                entry["storage_section"],
                chosen_champion_card_id=chosen_champion_card_id,
            )

            if user_id is not None:
                owned_quantity = owned_quantities.get(card.id, 0)
                fulfilled_quantity = owned_coverage_allocations.get(
                    self._build_owned_coverage_key(deck.id, card.id, entry["storage_section"]),
                    self._resolve_covered_quantity(deck_item, owned_quantity, advanced_mode),
                )
                missing_quantity = max(deck_item.quantity - fulfilled_quantity, 0)
                missing_copies += missing_quantity
                base_payload.update(
                    {
                        "assigned_quantity": deck_item.assigned_quantity,
                        "owned_quantity": owned_quantity,
                        "fulfilled_quantity": fulfilled_quantity,
                        "missing_quantity": missing_quantity,
                        "manual_assignment_active": advanced_mode and deck_item.assigned_quantity is not None,
                    }
                )

            serialized_cards.append(base_payload)

        for entry in egg_entries:
            deck_item = entry["deck_item"]
            card = entry["card"]
            base_payload = self._serialize_playable_deck_card(
                deck_tgc,
                rules,
                deck_item,
                card,
                composition,
                entry["storage_section"],
                chosen_champion_card_id=chosen_champion_card_id,
            )

            if user_id is not None:
                owned_quantity = owned_quantities.get(card.id, 0)
                fulfilled_quantity = owned_coverage_allocations.get(
                    self._build_owned_coverage_key(deck.id, card.id, entry["storage_section"]),
                    self._resolve_covered_quantity(deck_item, owned_quantity, advanced_mode),
                )
                missing_quantity = max(deck_item.quantity - fulfilled_quantity, 0)
                missing_copies += missing_quantity
                base_payload.update(
                    {
                        "assigned_quantity": deck_item.assigned_quantity,
                        "owned_quantity": owned_quantity,
                        "fulfilled_quantity": fulfilled_quantity,
                        "missing_quantity": missing_quantity,
                        "manual_assignment_active": advanced_mode and deck_item.assigned_quantity is not None,
                    }
                )

            serialized_egg_cards.append(base_payload)

        for entry in zone_entries:
            deck_item = entry["deck_item"]
            card = entry["card"]
            storage_section = entry["storage_section"]
            base_payload = self._serialize_playable_deck_card(
                deck_tgc,
                rules,
                deck_item,
                card,
                composition,
                storage_section,
                chosen_champion_card_id=chosen_champion_card_id,
            )

            if user_id is not None:
                owned_quantity = owned_quantities.get(card.id, 0)
                fulfilled_quantity = owned_coverage_allocations.get(
                    self._build_owned_coverage_key(deck.id, card.id, storage_section),
                    self._resolve_covered_quantity(deck_item, owned_quantity, advanced_mode),
                )
                missing_quantity = max(deck_item.quantity - fulfilled_quantity, 0)
                missing_copies += missing_quantity
                base_payload.update(
                    {
                        "assigned_quantity": deck_item.assigned_quantity,
                        "owned_quantity": owned_quantity,
                        "fulfilled_quantity": fulfilled_quantity,
                        "missing_quantity": missing_quantity,
                        "manual_assignment_active": advanced_mode and deck_item.assigned_quantity is not None,
                    }
                )

            if storage_section == "legend":
                serialized_legend_cards.append(base_payload)
            elif storage_section == "rune":
                serialized_rune_cards.append(base_payload)
            elif storage_section == "battlefield":
                serialized_battlefield_cards.append(base_payload)
            elif storage_section == "sideboard":
                serialized_sideboard_cards.append(base_payload)

        for entry in considering_entries:
            considering_card = entry["considering_card"]
            card = entry["card"]
            base_payload = self._serialize_considering_card(deck_tgc, rules, considering_card, card)

            if user_id is not None:
                base_payload["owned_quantity"] = owned_quantities.get(card.id, 0)

            serialized_considering_cards.append(base_payload)

        role_order = {"leader": 0, "legend": 1, "egg": 2, "main": 3, "rune": 4, "battlefield": 5, "don": 6, "sideboard": 7}
        serialized_cards.sort(
            key=lambda item: (
                role_order.get(item["deck_role"], 9),
                item["cost"] if item["cost"] is not None else 999,
                item["name"].lower(),
                item["source_card_id"] or "",
            )
        )
        serialized_egg_cards.sort(
            key=lambda item: (
                item["lv"] if item["lv"] is not None else 999,
                item["name"].lower(),
                item["source_card_id"] or "",
            )
        )
        serialized_considering_cards.sort(
            key=lambda item: (
                role_order.get(item["deck_role"], 9),
                item["cost"] if item["cost"] is not None else 999,
                item["name"].lower(),
                item["source_card_id"] or "",
            )
        )

        response = self._build_deck_response_base(deck, deck_tgc, rules, composition, total_cards)
        response["cards"] = serialized_cards
        response["egg_cards"] = serialized_egg_cards
        response["egg_total_cards"] = egg_total_cards
        response["egg_unique_cards"] = len(serialized_egg_cards)
        response["legend_card"] = serialized_legend_cards[0] if serialized_legend_cards else None
        response["legend_cards_data"] = serialized_legend_cards
        response["legend_total_cards"] = legend_total_cards
        response["legend_unique_cards"] = len(serialized_legend_cards)
        response["rune_cards_data"] = serialized_rune_cards
        response["rune_total_cards"] = rune_total_cards
        response["rune_unique_cards"] = len(serialized_rune_cards)
        response["battlefield_cards_data"] = serialized_battlefield_cards
        response["battlefield_total_cards"] = battlefield_total_cards
        response["battlefield_unique_cards"] = len(serialized_battlefield_cards)
        response["sideboard_cards_data"] = serialized_sideboard_cards
        response["sideboard_total_cards"] = sideboard_total_cards
        response["sideboard_unique_cards"] = len(serialized_sideboard_cards)
        response["considering_cards"] = serialized_considering_cards
        response["considering_total_cards"] = considering_total_cards
        response["considering_unique_cards"] = len(serialized_considering_cards)
        response["chosen_champion_card_id"] = chosen_champion_card_id
        response["chosen_champion_card"] = next(
            (card for card in serialized_cards if card.get("is_chosen_champion")),
            None,
        )

        if user_id is not None:
            response["missing_copies"] = missing_copies
            response["advanced_mode"] = advanced_mode

        if include_share_token:
            response["share_token"] = deck.share_token

        return response

    def get_user_decks(self, user_id: int, tgc_id: Optional[int] = None):
        query = self.db.query(Deck).filter(Deck.user_id == user_id)

        if tgc_id is not None:
            default_tgc = self._get_default_tgc()
            if default_tgc and tgc_id == default_tgc.id:
                query = query.filter(or_(Deck.tgc_id == tgc_id, Deck.tgc_id.is_(None)))
            else:
                query = query.filter(Deck.tgc_id == tgc_id)

        decks = query.order_by(Deck.created_at.desc(), Deck.id.desc()).all()
        deck_ids = [deck.id for deck in decks]
        playable_entries_by_deck = self._get_bulk_playable_entries_by_deck(deck_ids)
        tgc_map = self._get_tgcs_by_ids([deck.tgc_id for deck in decks if deck.tgc_id is not None])
        default_tgc = self._get_default_tgc() if any(deck.tgc_id is None for deck in decks) else None
        summaries = []
        for deck in decks:
            playable_entries = playable_entries_by_deck.get(deck.id, [])
            deck_tgc = self._resolve_summary_deck_tgc(
                deck,
                tgc_map.get(deck.tgc_id) if deck.tgc_id is not None else None,
                playable_entries,
                default_tgc=default_tgc,
            )
            rules = self._get_rules_for_serialization(deck_tgc)
            summaries.append(
                self._serialize_deck_summary_payload(
                    deck,
                    deck_tgc,
                    rules,
                    playable_entries,
                )
            )
        return summaries

    def get_user_deck_options(self, user_id: int, tgc_id: Optional[int] = None):
        query = self.db.query(Deck).filter(Deck.user_id == user_id)

        if tgc_id is not None:
            default_tgc = self._get_default_tgc()
            if default_tgc and tgc_id == default_tgc.id:
                query = query.filter(or_(Deck.tgc_id == tgc_id, Deck.tgc_id.is_(None)))
            else:
                query = query.filter(Deck.tgc_id == tgc_id)

        decks = query.order_by(Deck.created_at.desc(), Deck.id.desc()).all()
        return [
            {
                "id": deck.id,
                "name": deck.name,
                "tgc_id": deck.tgc_id,
            }
            for deck in decks
        ]

    def get_user_deck_search_options(self, user_id: int, tgc_id: Optional[int] = None):
        query = self.db.query(Deck).filter(Deck.user_id == user_id)

        if tgc_id is not None:
            default_tgc = self._get_default_tgc()
            if default_tgc and tgc_id == default_tgc.id:
                query = query.filter(or_(Deck.tgc_id == tgc_id, Deck.tgc_id.is_(None)))
            else:
                query = query.filter(Deck.tgc_id == tgc_id)

        decks = query.order_by(Deck.created_at.desc(), Deck.id.desc()).all()
        deck_ids = [deck.id for deck in decks]
        playable_entries_by_deck = self._get_bulk_playable_entries_by_deck(deck_ids)
        tgc_map = self._get_tgcs_by_ids([deck.tgc_id for deck in decks if deck.tgc_id is not None])
        default_tgc = self._get_default_tgc() if any(deck.tgc_id is None for deck in decks) else None
        options = []

        for deck in decks:
            playable_entries = playable_entries_by_deck.get(deck.id, [])
            deck_tgc = self._resolve_summary_deck_tgc(
                deck,
                tgc_map.get(deck.tgc_id) if deck.tgc_id is not None else None,
                playable_entries,
                default_tgc=default_tgc,
            )
            rules = self._get_rules_for_serialization(deck_tgc)
            summary = self._serialize_deck_summary_payload(
                deck,
                deck_tgc,
                rules,
                playable_entries,
            )
            composition = summary["composition"]
            options.append(
                {
                    "id": summary["id"],
                    "name": summary["name"],
                    "tgc_id": summary["tgc_id"],
                    "tgc_name": summary["tgc_name"],
                    "format_mode": composition["format_mode"],
                    "total_cards": summary["total_cards"],
                    "max_cards": summary["max_cards"],
                    "leader_cards": composition["leader_cards"],
                    "required_leader_cards": composition["required_leader_cards"],
                    "main_deck_cards": composition["main_deck_cards"],
                    "required_main_deck_cards": composition["required_main_deck_cards"],
                    "don_cards": composition["don_cards"],
                    "recommended_don_cards": composition["recommended_don_cards"],
                    "egg_cards": composition.get("egg_cards", 0),
                    "max_egg_cards": composition.get("max_egg_cards", 0),
                    "leader_color_labels": composition["leader_color_labels"],
                    "deck_color_labels": composition.get("deck_color_labels", []),
                    "max_deck_colors": composition.get("max_deck_colors", 0),
                    "legend_cards": composition.get("legend_cards", 0),
                    "required_legend_cards": composition.get("required_legend_cards", 0),
                    "rune_cards": composition.get("rune_cards", 0),
                    "required_rune_cards": composition.get("required_rune_cards", 0),
                    "battlefield_cards": composition.get("battlefield_cards", 0),
                    "required_battlefield_cards": composition.get("required_battlefield_cards", 0),
                    "chosen_champion_cards": composition.get("chosen_champion_cards", 0),
                    "required_chosen_champion_cards": composition.get("required_chosen_champion_cards", 0),
                    "domain_labels": composition.get("domain_labels", []),
                    "is_complete": summary["is_complete"],
                }
            )

        return options

    def get_deck_details(self, deck_id: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)
        return self._serialize_deck_payload(deck, deck_tgc, rules, user_id=user_id)

    def get_deck_summary(self, deck_id: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)
        return self._serialize_deck_summary_payload(deck, deck_tgc, rules, self._get_playable_entries(deck.id))

    def get_shared_deck(self, share_token: str):
        deck = self.db.query(Deck).filter(Deck.share_token == share_token).first()
        if not deck:
            raise ValueError("Shared deck not found")

        deck_tgc, rules = self._get_rules_for_deck(deck)
        return self._serialize_deck_payload(deck, deck_tgc, rules, include_share_token=True)
