import secrets
from typing import List, Optional

from sqlalchemy import func

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
