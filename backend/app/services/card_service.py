from typing import List, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import Card, UserCollection, Deck, DeckCard, Tgc, User
from app.database.repositories.card_repository import CardRepository
from app.services.game_rules import GUNDAM_TGC_NAME
from app.services.image_service import normalize_card_image_url

class CardService:
    def __init__(self, db: Session):
        self.db = db
        self.card_repo = CardRepository(db)

    def serialize_card(self, card: Card):
        return {
            "id": card.id,
            "tgc_id": card.tgc_id,
            "source_card_id": card.source_card_id,
            "name": card.name,
            "card_type": card.card_type,
            "lv": card.lv,
            "cost": card.cost,
            "ap": card.ap,
            "hp": card.hp,
            "color": card.color,
            "rarity": card.rarity,
            "set_name": card.set_name,
            "version": card.version,
            "block": card.block,
            "traits": card.traits,
            "link": card.link,
            "zones": card.zones,
            "artist": card.artist,
            "abilities": card.abilities,
            "description": card.description,
            "image_url": normalize_card_image_url(card.image_url),
        }

    def get_all_cards(self, tgc_id: Optional[int] = None) -> List[Card]:
        query = self.db.query(Card)
        if tgc_id is not None:
            query = query.filter(Card.tgc_id == tgc_id)
        return [self.serialize_card(card) for card in query.order_by(Card.name.asc()).all()]

    def create_card(self, tgc_id: int, name: str, card_type: str = None, lv: int = None, cost: int = None, ap: int = None, hp: int = None, color: str = None, rarity: str = None, set_name: str = None, version: str = None, abilities: str = None, description: str = None, image_url: str = None) -> Card:
        card = Card(tgc_id=tgc_id, name=name, card_type=card_type, lv=lv, cost=cost, ap=ap, hp=hp, color=color, rarity=rarity, set_name=set_name, version=version, abilities=abilities, description=description, image_url=image_url)
        return self.card_repo.create(card)

    def _get_default_tgc_id(self):
        tgc = self.db.query(Tgc).filter(Tgc.name == GUNDAM_TGC_NAME).first()
        return tgc.id if tgc else None

    def _is_advanced_mode_enabled(self, user_id: int) -> bool:
        return bool(
            self.db.query(User.advanced_mode)
            .filter(User.id == user_id)
            .scalar()
        )

    def get_user_collection(self, user_id: int, tgc_id: Optional[int] = None):
        query = (
            self.db.query(UserCollection)
            .join(Card, Card.id == UserCollection.card_id)
            .filter(UserCollection.user_id == user_id)
        )

        if tgc_id is not None:
            query = query.filter(Card.tgc_id == tgc_id)

        collections = query.all()
        advanced_mode = self._is_advanced_mode_enabled(user_id)
        result = []
        for col in collections:
            deck_query = (
                self.db.query(Deck, DeckCard)
                .join(DeckCard, Deck.id == DeckCard.deck_id)
                .filter(DeckCard.card_id == col.card_id, Deck.user_id == user_id)
            )

            if tgc_id is not None:
                default_tgc_id = self._get_default_tgc_id()
                if default_tgc_id and tgc_id == default_tgc_id:
                    deck_query = deck_query.filter(or_(Deck.tgc_id == tgc_id, Deck.tgc_id.is_(None)))
                else:
                    deck_query = deck_query.filter(Deck.tgc_id == tgc_id)

            deck_rows = deck_query.all()
            used_in_decks = sum(
                (
                    deck_card.assigned_quantity
                    if advanced_mode and deck_card.assigned_quantity is not None
                    else deck_card.quantity
                )
                for _, deck_card in deck_rows
            )
            result.append({
                "card": self.serialize_card(col.card),
                "total_quantity": col.quantity,
                "available_quantity": max(col.quantity - used_in_decks, 0),
                "decks": [
                    {
                        "id": d.id,
                        "name": d.name,
                        "quantity": deck_card.quantity,
                    }
                    for d, deck_card in deck_rows
                ],
            })
        return result

    def add_to_collection(self, user_id: int, card_id: int, quantity: int = 1):
        collection = self.db.query(UserCollection).filter(UserCollection.user_id == user_id, UserCollection.card_id == card_id).first()
        if collection:
            collection.quantity += quantity
        else:
            collection = UserCollection(user_id=user_id, card_id=card_id, quantity=quantity)
            self.db.add(collection)
        self.db.commit()
        return collection

    def adjust_collection_quantity(self, user_id: int, card_id: int, delta: int):
        collection = (
            self.db.query(UserCollection)
            .filter(UserCollection.user_id == user_id, UserCollection.card_id == card_id)
            .first()
        )
        if not collection:
            raise ValueError("Card not found in collection")

        next_quantity = collection.quantity + delta

        if next_quantity < 0:
            raise ValueError("Quantity cannot be negative")

        if next_quantity == 0:
            self.db.delete(collection)
            self.db.commit()
            return None

        collection.quantity = next_quantity
        self.db.commit()
        self.db.refresh(collection)
        return collection
