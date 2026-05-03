from typing import Optional

from sqlalchemy import or_

from app.models import Card, Deck, DeckConsideringCard
from app.services.game_rules import GUNDAM_TGC_NAME
from app.services.image_service import resolve_card_image_url


class DeckServicePayloadMixin:
    def _resolve_card_image_url(self, deck_tgc, card: Card):
        return resolve_card_image_url(
            card.image_url,
            source_card_id=card.source_card_id,
            tgc_name=deck_tgc.name if deck_tgc else None,
        )

    def _serialize_playable_deck_card(self, deck_tgc, rules: dict, deck_item, card: Card, composition: dict, storage_section: str):
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
        }

    def _build_deck_response_base(self, deck: Deck, deck_tgc, rules: dict, composition: dict, total_cards: int):
        return {
            "id": deck.id,
            "name": deck.name,
            "tgc_id": deck_tgc.id if deck_tgc else None,
            "tgc_name": deck_tgc.name if deck_tgc else GUNDAM_TGC_NAME,
            "created_at": deck.created_at,
            "total_cards": total_cards,
            "min_cards": rules["deck_min_cards"],
            "max_cards": rules["deck_max_cards"],
            "max_copies_per_card": rules["max_copies_per_card"],
            "remaining_cards": (
                max(rules["deck_max_cards"] - composition["main_deck_cards"], 0)
                if self._is_one_piece_tgc(deck_tgc) or self._is_digimon_tgc(deck_tgc)
                else max(rules["deck_max_cards"] - total_cards, 0)
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
            "leader_color_labels": composition["leader_color_labels"],
            "deck_color_labels": composition.get("deck_color_labels", []),
            "max_deck_colors": composition.get("max_deck_colors", 0),
            "off_color_cards": composition["off_color_cards"],
            "egg_total_cards": 0,
            "egg_unique_cards": 0,
            "considering_total_cards": 0,
            "considering_unique_cards": 0,
        }

    def _serialize_deck_payload(self, deck: Deck, deck_tgc, rules: dict, user_id: Optional[int] = None, include_share_token: bool = False):
        deck_entries = self._get_deck_entries(deck.id)
        egg_entries = self._get_egg_entries(deck.id)
        considering_entries = self._get_considering_entries(deck.id)
        playable_entries = [*deck_entries, *egg_entries]
        composition = self._build_deck_composition(deck_tgc, rules, playable_entries)
        total_cards = sum(entry["quantity"] for entry in playable_entries)
        egg_total_cards = sum(entry["quantity"] for entry in egg_entries)
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
        serialized_considering_cards = []
        missing_copies = 0

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

        for entry in considering_entries:
            considering_card = entry["considering_card"]
            card = entry["card"]
            base_payload = self._serialize_considering_card(deck_tgc, rules, considering_card, card)

            if user_id is not None:
                base_payload["owned_quantity"] = owned_quantities.get(card.id, 0)

            serialized_considering_cards.append(base_payload)

        role_order = {"leader": 0, "egg": 1, "main": 2, "don": 3}
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
        response["considering_cards"] = serialized_considering_cards
        response["considering_total_cards"] = considering_total_cards
        response["considering_unique_cards"] = len(serialized_considering_cards)

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
        summaries = []
        for deck in decks:
            deck_tgc, rules = self._get_rules_for_deck(deck)
            summaries.append(self._serialize_deck_payload(deck, deck_tgc, rules))
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
        options = []

        for deck in decks:
            deck_tgc, rules = self._get_rules_for_deck(deck)
            playable_entries = self._get_playable_entries(deck.id)
            composition = self._build_deck_composition(deck_tgc, rules, playable_entries)
            total_cards = sum(entry["quantity"] for entry in playable_entries)
            options.append(
                {
                    "id": deck.id,
                    "name": deck.name,
                    "tgc_id": deck.tgc_id,
                    "tgc_name": deck_tgc.name if deck_tgc else GUNDAM_TGC_NAME,
                    "format_mode": composition["format_mode"],
                    "total_cards": total_cards,
                    "max_cards": rules["deck_max_cards"],
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
                    "is_complete": composition["is_valid"],
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
        return self._serialize_deck_payload(deck, deck_tgc, rules)

    def get_shared_deck(self, share_token: str):
        deck = self.db.query(Deck).filter(Deck.share_token == share_token).first()
        if not deck:
            raise ValueError("Shared deck not found")

        deck_tgc, rules = self._get_rules_for_deck(deck)
        return self._serialize_deck_payload(deck, deck_tgc, rules, include_share_token=True)
