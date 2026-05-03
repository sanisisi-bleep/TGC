import secrets
from typing import List, Optional

from sqlalchemy import func, literal

from app.models import Card, Deck, DeckCard, DeckConsideringCard, DeckEggCard, Tgc, User, UserCollection
from app.services.game_rules import GUNDAM_TGC_NAME, get_tcg_rules


class DeckServiceQueryMixin:
    def _get_user_deck_or_error(self, deck_id: int, user_id: int) -> Deck:
        deck = self.db.query(Deck).filter(Deck.id == deck_id, Deck.user_id == user_id).first()
        if not deck:
            raise ValueError("Deck not found")
        return deck

    def _get_deck_considering_card_or_error(self, deck_id: int, card_id: int) -> DeckConsideringCard:
        considering_card = (
            self.db.query(DeckConsideringCard)
            .filter(DeckConsideringCard.deck_id == deck_id, DeckConsideringCard.card_id == card_id)
            .first()
        )
        if not considering_card:
            raise ValueError("Card not found in considering")
        return considering_card

    def _get_any_deck_card_or_error(self, deck_id: int, card_id: int):
        deck_card = self.db.query(DeckCard).filter(DeckCard.deck_id == deck_id, DeckCard.card_id == card_id).first()
        if deck_card:
            return "main", deck_card

        deck_egg_card = (
            self.db.query(DeckEggCard)
            .filter(DeckEggCard.deck_id == deck_id, DeckEggCard.card_id == card_id)
            .first()
        )
        if deck_egg_card:
            return "egg", deck_egg_card

        raise ValueError("Card not found in deck")

    def _get_rules_for_deck(self, deck: Deck):
        deck_tgc = self._resolve_deck_tgc(deck)
        rules = get_tcg_rules(deck_tgc.name if deck_tgc else None)
        return deck_tgc, rules

    def _get_tgc_by_id(self, tgc_id: Optional[int]):
        if tgc_id is None:
            return None
        return self.db.query(Tgc).filter(Tgc.id == tgc_id).first()

    def _get_tgcs_by_ids(self, tgc_ids: List[int]) -> dict[int, Tgc]:
        if not tgc_ids:
            return {}

        tgcs = (
            self.db.query(Tgc)
            .filter(Tgc.id.in_(tgc_ids))
            .all()
        )
        return {tgc.id: tgc for tgc in tgcs}

    def _get_default_tgc(self):
        tgc = self.db.query(Tgc).filter(Tgc.name == GUNDAM_TGC_NAME).first()
        if tgc:
            return tgc

        tgc = Tgc(name=GUNDAM_TGC_NAME, description="Gundam Card Game")
        self.db.add(tgc)
        self.db.commit()
        self.db.refresh(tgc)
        return tgc

    def _resolve_deck_tgc(self, deck: Deck):
        if deck.tgc_id:
            return self.db.query(Tgc).filter(Tgc.id == deck.tgc_id).first()
        return self._get_default_tgc()

    def _generate_share_token(self):
        while True:
            token = secrets.token_urlsafe(16)
            exists = self.db.query(Deck.id).filter(Deck.share_token == token).first()
            if not exists:
                return token

    def _get_owned_quantity(self, user_id: int, card_id: int) -> int:
        return (
            self.db.query(UserCollection.quantity)
            .filter(UserCollection.user_id == user_id, UserCollection.card_id == card_id)
            .scalar()
            or 0
        )

    def _is_advanced_mode_enabled(self, user_id: int) -> bool:
        return bool(self.db.query(User.advanced_mode).filter(User.id == user_id).scalar())

    def _get_owned_quantities_map(self, user_id: int, card_ids: List[int]) -> dict[int, int]:
        if not card_ids:
            return {}

        rows = (
            self.db.query(UserCollection.card_id, UserCollection.quantity)
            .filter(UserCollection.user_id == user_id, UserCollection.card_id.in_(card_ids))
            .all()
        )
        return {card_id: quantity for card_id, quantity in rows}

    def _build_owned_coverage_key(self, deck_id: int, card_id: int, storage_section: str) -> tuple[int, int, str]:
        return deck_id, card_id, storage_section

    def _get_owned_coverage_allocations(
        self,
        user_id: int,
        card_ids: List[int],
        advanced_mode: bool,
    ) -> tuple[dict[tuple[int, int, str], int], dict[int, int]]:
        if not card_ids:
            return {}, {}

        owned_quantities = self._get_owned_quantities_map(user_id, card_ids)
        coverage_rows = []

        deck_card_rows = (
            self.db.query(
                Deck.id.label("deck_id"),
                Deck.created_at.label("created_at"),
                DeckCard.id.label("deck_item_id"),
                DeckCard.card_id.label("card_id"),
                DeckCard.quantity.label("quantity"),
                DeckCard.assigned_quantity.label("assigned_quantity"),
                literal("main").label("storage_section"),
            )
            .join(DeckCard, Deck.id == DeckCard.deck_id)
            .filter(Deck.user_id == user_id, DeckCard.card_id.in_(card_ids))
            .all()
        )
        coverage_rows.extend(deck_card_rows)

        egg_card_rows = (
            self.db.query(
                Deck.id.label("deck_id"),
                Deck.created_at.label("created_at"),
                DeckEggCard.id.label("deck_item_id"),
                DeckEggCard.card_id.label("card_id"),
                DeckEggCard.quantity.label("quantity"),
                DeckEggCard.assigned_quantity.label("assigned_quantity"),
                literal("egg").label("storage_section"),
            )
            .join(DeckEggCard, Deck.id == DeckEggCard.deck_id)
            .filter(Deck.user_id == user_id, DeckEggCard.card_id.in_(card_ids))
            .all()
        )
        coverage_rows.extend(egg_card_rows)

        rows_by_card_id: dict[int, list] = {}
        for row in coverage_rows:
            rows_by_card_id.setdefault(row.card_id, []).append(row)

        allocations: dict[tuple[int, int, str], int] = {}

        for card_id, rows in rows_by_card_id.items():
            remaining_owned = max(int(owned_quantities.get(card_id, 0) or 0), 0)
            ordered_rows = sorted(
                rows,
                key=lambda row: (
                    row.created_at,
                    row.deck_id,
                    0 if row.storage_section == "main" else 1,
                    row.deck_item_id,
                ),
            )

            if advanced_mode:
                prioritized_rows = [
                    row for row in ordered_rows
                    if row.assigned_quantity is not None
                ] + [
                    row for row in ordered_rows
                    if row.assigned_quantity is None
                ]
            else:
                prioritized_rows = ordered_rows

            for row in prioritized_rows:
                requested_quantity = max(int(row.quantity or 0), 0)
                if advanced_mode and row.assigned_quantity is not None:
                    requested_quantity = max(
                        min(int(row.assigned_quantity or 0), requested_quantity),
                        0,
                    )

                covered_quantity = min(requested_quantity, remaining_owned)
                allocations[self._build_owned_coverage_key(row.deck_id, row.card_id, row.storage_section)] = covered_quantity
                remaining_owned = max(remaining_owned - covered_quantity, 0)

        return allocations, owned_quantities

    def _get_deck_total_quantity(self, deck_id: int) -> int:
        return (
            self.db.query(func.coalesce(func.sum(DeckCard.quantity), 0))
            .filter(DeckCard.deck_id == deck_id)
            .scalar()
            or 0
        )

    def _get_considering_total_quantity(self, deck_id: int) -> int:
        return (
            self.db.query(func.coalesce(func.sum(DeckConsideringCard.quantity), 0))
            .filter(DeckConsideringCard.deck_id == deck_id)
            .scalar()
            or 0
        )

    def _get_egg_total_quantity(self, deck_id: int) -> int:
        return (
            self.db.query(func.coalesce(func.sum(DeckEggCard.quantity), 0))
            .filter(DeckEggCard.deck_id == deck_id)
            .scalar()
            or 0
        )

    def _resolve_import_card(self, resolved_tgc_id: Optional[int], card_data: dict):
        query = self.db.query(Card)

        if resolved_tgc_id is not None:
            query = query.filter(Card.tgc_id == resolved_tgc_id)

        card_id = card_data.get("card_id")
        if card_id is not None:
            card = query.filter(Card.id == card_id).first()
            if card:
                return card

        source_card_id = (card_data.get("source_card_id") or "").strip()
        if not source_card_id:
            raise ValueError("Each imported card must include card_id or source_card_id")

        version = (card_data.get("version") or "").strip()
        source_query = query.filter(Card.source_card_id == source_card_id)

        if version:
            source_query = source_query.filter(func.coalesce(Card.version, "") == version)

        card = source_query.first()
        if not card:
            fallback_query = query.filter(func.coalesce(Card.deck_key, "") == source_card_id)

            if version:
                fallback_query = fallback_query.filter(func.coalesce(Card.version, "") == version)

            card = fallback_query.first()
        if not card:
            raise ValueError(f"Card not found for import: {source_card_id}")

        return card

    def _resolve_covered_quantity(self, deck_card: DeckCard, owned_quantity: int, advanced_mode: bool) -> int:
        if not advanced_mode or deck_card.assigned_quantity is None:
            return min(deck_card.quantity, owned_quantity)

        normalized_assignment = max(min(deck_card.assigned_quantity, deck_card.quantity), 0)
        return min(normalized_assignment, deck_card.quantity, owned_quantity)

    def _get_deck_entries(self, deck_id: int):
        rows = (
            self.db.query(DeckCard, Card)
            .join(Card, Card.id == DeckCard.card_id)
            .filter(DeckCard.deck_id == deck_id)
            .order_by(DeckCard.id.asc(), Card.id.asc())
            .all()
        )
        return [
            {
                "deck_item": deck_card,
                "card": card,
                "quantity": deck_card.quantity,
                "storage_section": "main",
            }
            for deck_card, card in rows
        ]

    def _get_egg_entries(self, deck_id: int):
        rows = (
            self.db.query(DeckEggCard, Card)
            .join(Card, Card.id == DeckEggCard.card_id)
            .filter(DeckEggCard.deck_id == deck_id)
            .order_by(DeckEggCard.id.asc(), Card.id.asc())
            .all()
        )
        return [
            {
                "deck_item": deck_egg_card,
                "card": card,
                "quantity": deck_egg_card.quantity,
                "storage_section": "egg",
            }
            for deck_egg_card, card in rows
        ]

    def _get_playable_entries(self, deck_id: int):
        return [*self._get_deck_entries(deck_id), *self._get_egg_entries(deck_id)]

    def _get_bulk_playable_entries_by_deck(self, deck_ids: List[int]) -> dict[int, list[dict]]:
        grouped_entries = {deck_id: [] for deck_id in deck_ids}

        if not deck_ids:
            return grouped_entries

        deck_rows = (
            self.db.query(DeckCard, Card)
            .join(Card, Card.id == DeckCard.card_id)
            .filter(DeckCard.deck_id.in_(deck_ids))
            .order_by(DeckCard.deck_id.asc(), DeckCard.id.asc(), Card.id.asc())
            .all()
        )
        for deck_card, card in deck_rows:
            grouped_entries.setdefault(deck_card.deck_id, []).append(
                {
                    "deck_item": deck_card,
                    "card": card,
                    "quantity": deck_card.quantity,
                    "storage_section": "main",
                }
            )

        egg_rows = (
            self.db.query(DeckEggCard, Card)
            .join(Card, Card.id == DeckEggCard.card_id)
            .filter(DeckEggCard.deck_id.in_(deck_ids))
            .order_by(DeckEggCard.deck_id.asc(), DeckEggCard.id.asc(), Card.id.asc())
            .all()
        )
        for deck_egg_card, card in egg_rows:
            grouped_entries.setdefault(deck_egg_card.deck_id, []).append(
                {
                    "deck_item": deck_egg_card,
                    "card": card,
                    "quantity": deck_egg_card.quantity,
                    "storage_section": "egg",
                }
            )

        return grouped_entries

    def _get_storage_total_quantity(self, deck_id: int, storage_section: str) -> int:
        if storage_section == "egg":
            return self._get_egg_total_quantity(deck_id)
        return self._get_deck_total_quantity(deck_id)

    def _get_storage_card_record(self, deck_id: int, card_id: int, storage_section: str):
        if storage_section == "egg":
            return (
                self.db.query(DeckEggCard)
                .filter(DeckEggCard.deck_id == deck_id, DeckEggCard.card_id == card_id)
                .first()
            )
        return self.db.query(DeckCard).filter(DeckCard.deck_id == deck_id, DeckCard.card_id == card_id).first()

    def _get_considering_entries(self, deck_id: int):
        rows = (
            self.db.query(DeckConsideringCard, Card)
            .join(Card, Card.id == DeckConsideringCard.card_id)
            .filter(DeckConsideringCard.deck_id == deck_id)
            .order_by(DeckConsideringCard.id.asc(), Card.id.asc())
            .all()
        )
        return [
            {
                "considering_card": considering_card,
                "card": card,
                "quantity": considering_card.quantity,
            }
            for considering_card, card in rows
        ]

    def _build_candidate_deck_entries(self, deck_tgc, deck_id: int, target_card: Card, next_quantity: int):
        entries = self._get_playable_entries(deck_id)
        target_section = self._get_card_storage_section(deck_tgc, target_card)
        replaced = False
        candidate_entries = []

        for entry in entries:
            if entry["storage_section"] == target_section and entry["card"].id == target_card.id:
                replaced = True
                if next_quantity > 0:
                    candidate_entries.append(
                        {
                            "deck_item": entry["deck_item"],
                            "card": entry["card"],
                            "quantity": next_quantity,
                            "storage_section": entry["storage_section"],
                        }
                    )
                continue

            candidate_entries.append(entry)

        if not replaced and next_quantity > 0:
            candidate_entries.append(
                {
                    "deck_item": None,
                    "card": target_card,
                    "quantity": next_quantity,
                    "storage_section": target_section,
                }
            )

        return candidate_entries
