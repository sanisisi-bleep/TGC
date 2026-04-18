import secrets

from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.models import Deck, DeckCard, UserCollection, Card, Tgc, User
from typing import List, Optional
from app.services.game_rules import GUNDAM_TGC_NAME, get_tcg_rules
from app.services.image_service import normalize_card_image_url


class DeckService:
    def __init__(self, db: Session):
        self.db = db

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
        return bool(
            self.db.query(User.advanced_mode)
            .filter(User.id == user_id)
            .scalar()
        )

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
            raise ValueError(f"Card not found for import: {source_card_id}")

        return card

    def _resolve_covered_quantity(self, deck_card: DeckCard, owned_quantity: int, advanced_mode: bool) -> int:
        if not advanced_mode or deck_card.assigned_quantity is None:
            return min(deck_card.quantity, owned_quantity)

        normalized_assignment = max(min(deck_card.assigned_quantity, deck_card.quantity), 0)
        return min(normalized_assignment, deck_card.quantity, owned_quantity)

    def get_user_decks(self, user_id: int, tgc_id: Optional[int] = None) -> List[Deck]:
        query = self.db.query(Deck).filter(Deck.user_id == user_id)

        if tgc_id is not None:
            default_tgc = self._get_default_tgc()
            if default_tgc and tgc_id == default_tgc.id:
                query = query.filter(or_(Deck.tgc_id == tgc_id, Deck.tgc_id.is_(None)))
            else:
                query = query.filter(Deck.tgc_id == tgc_id)

        return query.all()

    def get_deck_details(self, deck_id: int, user_id: int):
        deck = self.db.query(Deck).filter(Deck.id == deck_id, Deck.user_id == user_id).first()
        if not deck:
            raise ValueError("Deck not found")

        deck_tgc = self._resolve_deck_tgc(deck)
        rules = get_tcg_rules(deck_tgc.name if deck_tgc else None)

        deck_cards = (
            self.db.query(DeckCard, Card)
            .join(Card, Card.id == DeckCard.card_id)
            .filter(DeckCard.deck_id == deck_id)
            .all()
        )

        advanced_mode = self._is_advanced_mode_enabled(user_id)
        owned_quantities = self._get_owned_quantities_map(
            user_id,
            [card.id for _, card in deck_cards],
        )
        total_cards = sum(deck_card.quantity for deck_card, _ in deck_cards)
        serialized_cards = []
        missing_copies = 0

        for deck_card, card in deck_cards:
            owned_quantity = owned_quantities.get(card.id, 0)
            fulfilled_quantity = self._resolve_covered_quantity(deck_card, owned_quantity, advanced_mode)
            missing_quantity = max(deck_card.quantity - fulfilled_quantity, 0)
            missing_copies += missing_quantity

            serialized_cards.append(
                {
                    "id": card.id,
                    "source_card_id": card.source_card_id,
                    "name": card.name,
                    "image_url": normalize_card_image_url(card.image_url),
                    "card_type": card.card_type,
                    "lv": card.lv,
                    "cost": card.cost,
                    "color": card.color,
                    "rarity": card.rarity,
                    "set_name": card.set_name,
                    "version": card.version,
                    "quantity": deck_card.quantity,
                    "assigned_quantity": deck_card.assigned_quantity,
                    "owned_quantity": owned_quantity,
                    "fulfilled_quantity": fulfilled_quantity,
                    "missing_quantity": missing_quantity,
                    "manual_assignment_active": advanced_mode and deck_card.assigned_quantity is not None,
                }
            )

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
            "remaining_cards": max(rules["deck_max_cards"] - total_cards, 0),
            "is_complete": total_cards >= rules["deck_min_cards"] and total_cards <= rules["deck_max_cards"],
            "missing_copies": missing_copies,
            "advanced_mode": advanced_mode,
            "cards": serialized_cards,
        }

    def create_deck(self, user_id: int, name: str, tgc_id: Optional[int] = None) -> Deck:
        resolved_tgc_id = tgc_id
        if resolved_tgc_id is None:
            default_tgc = self._get_default_tgc()
            resolved_tgc_id = default_tgc.id if default_tgc else None

        deck = Deck(user_id=user_id, tgc_id=resolved_tgc_id, name=name)
        self.db.add(deck)
        self.db.commit()
        self.db.refresh(deck)
        return deck

    def import_deck(self, user_id: int, name: Optional[str], tgc_id: Optional[int], cards: List[dict]):
        if not cards:
            raise ValueError("Imported deck must include at least one card")

        target_tgc = self._get_tgc_by_id(tgc_id) if tgc_id is not None else self._get_default_tgc()
        if tgc_id is not None and target_tgc is None:
            raise ValueError("Target TCG not found for imported deck")
        resolved_tgc_id = target_tgc.id if target_tgc else None
        rules = get_tcg_rules(target_tgc.name if target_tgc else None)

        aggregated_cards = {}
        total_cards = 0

        for raw_card in cards:
            quantity = int(raw_card.get("quantity") or 0)
            if quantity <= 0:
                raise ValueError("Imported card quantity must be greater than zero")

            card = self._resolve_import_card(resolved_tgc_id, raw_card)
            total_cards += quantity

            if total_cards > rules["deck_max_cards"]:
                raise ValueError(
                    f"{target_tgc.name if target_tgc else 'This TCG'} decks cannot exceed {rules['deck_max_cards']} cards"
                )

            aggregated_cards[card.id] = aggregated_cards.get(card.id, 0) + quantity
            if aggregated_cards[card.id] > rules["max_copies_per_card"]:
                raise ValueError(
                    f"You can only have up to {rules['max_copies_per_card']} copies of this card in this deck"
                )

        deck_name = (name or "").strip() or "Mazo importado"
        deck = Deck(user_id=user_id, tgc_id=resolved_tgc_id, name=deck_name[:100])
        self.db.add(deck)
        self.db.flush()

        for card_id, quantity in aggregated_cards.items():
            self.db.add(
                DeckCard(
                    deck_id=deck.id,
                    card_id=card_id,
                    quantity=quantity,
                )
            )

        self.db.commit()
        self.db.refresh(deck)
        return deck

    def rename_deck(self, deck_id: int, user_id: int, name: str):
        deck = self.db.query(Deck).filter(Deck.id == deck_id, Deck.user_id == user_id).first()
        if not deck:
            raise ValueError("Deck not found")

        cleaned_name = (name or "").strip()
        if not cleaned_name:
            raise ValueError("Deck name cannot be empty")

        deck.name = cleaned_name[:100]
        self.db.commit()
        self.db.refresh(deck)
        return deck

    def delete_deck(self, deck_id: int, user_id: int):
        deck = self.db.query(Deck).filter(Deck.id == deck_id, Deck.user_id == user_id).first()
        if not deck:
            raise ValueError("Deck not found")

        self.db.query(DeckCard).filter(DeckCard.deck_id == deck.id).delete(synchronize_session=False)
        self.db.delete(deck)
        self.db.commit()
        return deck

    def clone_deck(self, deck_id: int, user_id: int):
        source_deck = self.db.query(Deck).filter(Deck.id == deck_id, Deck.user_id == user_id).first()
        if not source_deck:
            raise ValueError("Deck not found")

        cloned_deck = Deck(
            user_id=user_id,
            tgc_id=source_deck.tgc_id,
            name=f"{source_deck.name} (Copia)",
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
                    assigned_quantity=source_card.assigned_quantity,
                )
            )

        self.db.commit()
        self.db.refresh(cloned_deck)
        return cloned_deck

    def ensure_share_token(self, deck_id: int, user_id: int):
        deck = self.db.query(Deck).filter(Deck.id == deck_id, Deck.user_id == user_id).first()
        if not deck:
            raise ValueError("Deck not found")

        if not deck.share_token:
            deck.share_token = self._generate_share_token()
            self.db.commit()
            self.db.refresh(deck)

        return deck

    def get_shared_deck(self, share_token: str):
        deck = self.db.query(Deck).filter(Deck.share_token == share_token).first()
        if not deck:
            raise ValueError("Shared deck not found")

        deck_tgc = self._resolve_deck_tgc(deck)
        rules = get_tcg_rules(deck_tgc.name if deck_tgc else None)

        deck_cards = (
            self.db.query(DeckCard, Card)
            .join(Card, Card.id == DeckCard.card_id)
            .filter(DeckCard.deck_id == deck.id)
            .all()
        )

        total_cards = sum(deck_card.quantity for deck_card, _ in deck_cards)

        return {
            "id": deck.id,
            "name": deck.name,
            "share_token": deck.share_token,
            "tgc_id": deck_tgc.id if deck_tgc else None,
            "tgc_name": deck_tgc.name if deck_tgc else GUNDAM_TGC_NAME,
            "created_at": deck.created_at,
            "total_cards": total_cards,
            "min_cards": rules["deck_min_cards"],
            "max_cards": rules["deck_max_cards"],
            "max_copies_per_card": rules["max_copies_per_card"],
            "is_complete": total_cards >= rules["deck_min_cards"] and total_cards <= rules["deck_max_cards"],
            "cards": [
                {
                    "id": card.id,
                    "source_card_id": card.source_card_id,
                    "name": card.name,
                    "image_url": normalize_card_image_url(card.image_url),
                    "card_type": card.card_type,
                    "lv": card.lv,
                    "cost": card.cost,
                    "color": card.color,
                    "rarity": card.rarity,
                    "set_name": card.set_name,
                    "version": card.version,
                    "quantity": deck_card.quantity,
                }
                for deck_card, card in deck_cards
            ],
        }

    def add_card_to_deck(self, deck_id: int, card_id: int, quantity: int, user_id: int):
        # Check if user owns the deck
        deck = self.db.query(Deck).filter(Deck.id == deck_id, Deck.user_id == user_id).first()
        if not deck:
            raise ValueError("Deck not found")
        deck_tgc = self._resolve_deck_tgc(deck)
        rules = get_tcg_rules(deck_tgc.name if deck_tgc else None)

        if quantity <= 0:
            raise ValueError("Quantity must be greater than zero")

        card = self.db.query(Card).filter(Card.id == card_id).first()
        if not card:
            raise ValueError("Card not found")

        if card.tgc_id != (deck_tgc.id if deck_tgc else card.tgc_id):
            raise ValueError("Card belongs to a different TCG")

        deck_card = self.db.query(DeckCard).filter(DeckCard.deck_id == deck_id, DeckCard.card_id == card_id).first()
        current_quantity = deck_card.quantity if deck_card else 0
        next_quantity = current_quantity + quantity
        total_cards_in_deck = self._get_deck_total_quantity(deck_id)
        next_total = total_cards_in_deck - current_quantity + next_quantity

        if next_quantity > rules["max_copies_per_card"]:
            raise ValueError(
                f"You can only have up to {rules['max_copies_per_card']} copies of this card in this deck"
            )

        if next_total > rules["deck_max_cards"]:
            raise ValueError(f"{deck_tgc.name if deck_tgc else 'This TCG'} decks cannot exceed {rules['deck_max_cards']} cards")

        if deck_card:
            deck_card.quantity = next_quantity
            if deck_card.assigned_quantity is not None:
                deck_card.assigned_quantity = min(deck_card.assigned_quantity, next_quantity)
        else:
            deck_card = DeckCard(deck_id=deck_id, card_id=card_id, quantity=quantity)
            self.db.add(deck_card)
        self.db.commit()
        return deck_card

    def adjust_deck_card_quantity(self, deck_id: int, card_id: int, delta: int, user_id: int):
        deck = self.db.query(Deck).filter(Deck.id == deck_id, Deck.user_id == user_id).first()
        if not deck:
            raise ValueError("Deck not found")
        deck_tgc = self._resolve_deck_tgc(deck)
        rules = get_tcg_rules(deck_tgc.name if deck_tgc else None)

        deck_card = (
            self.db.query(DeckCard)
            .filter(DeckCard.deck_id == deck_id, DeckCard.card_id == card_id)
            .first()
        )
        if not deck_card:
            raise ValueError("Card not found in deck")

        next_quantity = deck_card.quantity + delta
        total_cards_in_deck = self._get_deck_total_quantity(deck_id)
        next_total = total_cards_in_deck - deck_card.quantity + max(next_quantity, 0)

        if next_quantity > rules["max_copies_per_card"]:
            raise ValueError(
                f"You can only have up to {rules['max_copies_per_card']} copies of this card in this deck"
            )

        if next_total > rules["deck_max_cards"]:
            raise ValueError(f"{deck_tgc.name if deck_tgc else 'This TCG'} decks cannot exceed {rules['deck_max_cards']} cards")

        if next_quantity <= 0:
            self.db.delete(deck_card)
            self.db.commit()
            return None

        deck_card.quantity = next_quantity
        if deck_card.assigned_quantity is not None:
            deck_card.assigned_quantity = min(deck_card.assigned_quantity, next_quantity)
        self.db.commit()
        self.db.refresh(deck_card)
        return deck_card

    def adjust_deck_card_assignment(self, deck_id: int, card_id: int, delta: int, user_id: int):
        deck = self.db.query(Deck).filter(Deck.id == deck_id, Deck.user_id == user_id).first()
        if not deck:
            raise ValueError("Deck not found")

        deck_card = (
            self.db.query(DeckCard)
            .filter(DeckCard.deck_id == deck_id, DeckCard.card_id == card_id)
            .first()
        )
        if not deck_card:
            raise ValueError("Card not found in deck")

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
        return deck_card
