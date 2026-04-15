from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.models import Deck, DeckCard, UserCollection, Card, Tgc
from typing import List, Optional
from app.services.game_rules import GUNDAM_TGC_NAME, get_tcg_rules


class DeckService:
    def __init__(self, db: Session):
        self.db = db

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

        total_cards = sum(deck_card.quantity for deck_card, _ in deck_cards)

        return {
            "id": deck.id,
            "name": deck.name,
            "tgc_id": deck_tgc.id if deck_tgc else None,
            "tgc_name": deck_tgc.name if deck_tgc else GUNDAM_TGC_NAME,
            "created_at": deck.created_at,
            "total_cards": total_cards,
            "min_cards": rules["deck_min_cards"],
            "max_cards": rules["deck_max_cards"],
            "remaining_cards": max(rules["deck_max_cards"] - total_cards, 0),
            "is_complete": total_cards >= rules["deck_min_cards"] and total_cards <= rules["deck_max_cards"],
            "cards": [
                {
                    "id": card.id,
                    "name": card.name,
                    "image_url": card.image_url,
                    "card_type": card.card_type,
                    "color": card.color,
                    "rarity": card.rarity,
                    "set_name": card.set_name,
                    "quantity": deck_card.quantity,
                    "owned_quantity": (
                        self.db.query(UserCollection.quantity)
                        .filter(UserCollection.user_id == user_id, UserCollection.card_id == card.id)
                        .scalar()
                        or 0
                    ),
                }
                for deck_card, card in deck_cards
            ],
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

    def add_card_to_deck(self, deck_id: int, card_id: int, quantity: int, user_id: int):
        # Check if user owns the deck
        deck = self.db.query(Deck).filter(Deck.id == deck_id, Deck.user_id == user_id).first()
        if not deck:
            raise ValueError("Deck not found")
        deck_tgc = self._resolve_deck_tgc(deck)
        rules = get_tcg_rules(deck_tgc.name if deck_tgc else None)

        if quantity <= 0:
            raise ValueError("Quantity must be greater than zero")

        # Check if user has enough cards
        collection = self.db.query(UserCollection).filter(UserCollection.user_id == user_id, UserCollection.card_id == card_id).first()
        if not collection:
            raise ValueError("Not enough cards in collection")
        if collection.card.tgc_id != (deck_tgc.id if deck_tgc else collection.card.tgc_id):
            raise ValueError("Card belongs to a different TCG")

        deck_card = self.db.query(DeckCard).filter(DeckCard.deck_id == deck_id, DeckCard.card_id == card_id).first()
        current_quantity = deck_card.quantity if deck_card else 0
        next_quantity = current_quantity + quantity
        allowed_quantity = min(rules["max_copies_per_card"], collection.quantity)
        current_total = (
            self.db.query(DeckCard)
            .filter(DeckCard.deck_id == deck_id)
            .with_entities(DeckCard.quantity)
            .all()
        )
        total_cards_in_deck = sum(item_quantity for (item_quantity,) in current_total)
        next_total = total_cards_in_deck - current_quantity + next_quantity

        if next_quantity > allowed_quantity:
            raise ValueError(
                f"You can only have up to {allowed_quantity} copies of this card in this deck"
            )

        if next_total > rules["deck_max_cards"]:
            raise ValueError(f"{deck_tgc.name if deck_tgc else 'This TCG'} decks cannot exceed {rules['deck_max_cards']} cards")

        if deck_card:
            deck_card.quantity = next_quantity
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

        collection = (
            self.db.query(UserCollection)
            .filter(UserCollection.user_id == user_id, UserCollection.card_id == card_id)
            .first()
        )
        owned_quantity = collection.quantity if collection else 0
        next_quantity = deck_card.quantity + delta
        allowed_quantity = min(rules["max_copies_per_card"], owned_quantity)
        current_total = (
            self.db.query(DeckCard)
            .filter(DeckCard.deck_id == deck_id)
            .with_entities(DeckCard.quantity)
            .all()
        )
        total_cards_in_deck = sum(item_quantity for (item_quantity,) in current_total)
        next_total = total_cards_in_deck - deck_card.quantity + max(next_quantity, 0)

        if next_quantity > allowed_quantity:
            raise ValueError(
                f"You can only have up to {allowed_quantity} copies of this card in this deck"
            )

        if next_total > rules["deck_max_cards"]:
            raise ValueError(f"{deck_tgc.name if deck_tgc else 'This TCG'} decks cannot exceed {rules['deck_max_cards']} cards")

        if next_quantity <= 0:
            self.db.delete(deck_card)
            self.db.commit()
            return None

        deck_card.quantity = next_quantity
        self.db.commit()
        self.db.refresh(deck_card)
        return deck_card
