import math
import re
from collections import defaultdict
from typing import List, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import Card, UserCollection, Deck, DeckCard, Tgc, User
from app.database.repositories.card_repository import CardRepository
from app.services.game_rules import GUNDAM_TGC_NAME, ONE_PIECE_TCG_NAME, get_one_piece_card_role
from app.services.image_service import build_card_thumbnail_url, normalize_card_image_url

class CardService:
    def __init__(self, db: Session):
        self.db = db
        self.card_repo = CardRepository(db)
        self._tgc_name_cache = {}

    def serialize_card(self, card: Card):
        image_url = normalize_card_image_url(card.image_url)
        return {
            "id": card.id,
            "tgc_id": card.tgc_id,
            "source_card_id": card.source_card_id,
            "name": card.name,
            "card_type": self._normalize_card_value(card.card_type),
            "lv": card.lv,
            "cost": card.cost,
            "ap": card.ap,
            "hp": card.hp,
            "color": self._normalize_card_value(card.color),
            "rarity": self._normalize_card_value(card.rarity),
            "set_name": self._normalize_set_name(card.set_name, card.card_type, card.tgc_id),
            "version": self._normalize_card_value(card.version),
            "block": card.block,
            "traits": card.traits,
            "link": card.link,
            "zones": card.zones,
            "artist": card.artist,
            "abilities": card.abilities,
            "description": card.description,
            "image_url": image_url,
            "thumbnail_url": build_card_thumbnail_url(image_url),
        }

    def _normalize_card_value(self, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None

        normalized = re.sub(r"\s+", " ", value).strip()
        return normalized or None

    def _normalize_filter_value(self, value: Optional[str]) -> Optional[str]:
        normalized = self._normalize_card_value(value)
        return normalized or None

    def _get_tgc_name(self, tgc_id: Optional[int]) -> Optional[str]:
        if tgc_id is None:
            return None

        if tgc_id not in self._tgc_name_cache:
            self._tgc_name_cache[tgc_id] = (
                self.db.query(Tgc.name)
                .filter(Tgc.id == tgc_id)
                .scalar()
            )

        return self._tgc_name_cache[tgc_id]

    def _is_one_piece_tgc(self, tgc_id: Optional[int]) -> bool:
        return self._get_tgc_name(tgc_id) == ONE_PIECE_TCG_NAME

    def _normalize_set_name(
        self,
        set_name: Optional[str],
        card_type: Optional[str],
        tgc_id: Optional[int],
    ) -> Optional[str]:
        normalized_set_name = self._normalize_card_value(set_name)

        if self._is_one_piece_tgc(tgc_id) and get_one_piece_card_role(card_type) == "don":
            return "DON!!"

        return normalized_set_name

    def _escape_like_pattern(self, value: str) -> str:
        return (
            value
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )

    def _normalized_sql_value(self, column):
        normalized_column = func.trim(column)
        bind = self.db.get_bind()

        if bind is not None and bind.dialect.name == "postgresql":
            normalized_column = func.regexp_replace(normalized_column, r"\s+", " ", "g")

        return func.lower(normalized_column)

    def _apply_normalized_exact_filter(self, query, column, value: Optional[str], tgc_id: Optional[int] = None):
        normalized_value = self._normalize_filter_value(value)
        if not normalized_value:
            return query

        if column.key == "set_name" and normalized_value == "DON!!" and self._is_one_piece_tgc(tgc_id):
            return query.filter(self._normalized_sql_value(Card.card_type).like("%don%"))

        return query.filter(self._normalized_sql_value(column) == normalized_value.lower())

    def _build_cards_query(
        self,
        tgc_id: Optional[int] = None,
        search: Optional[str] = None,
        card_type: Optional[str] = None,
        color: Optional[str] = None,
        rarity: Optional[str] = None,
        set_name: Optional[str] = None,
    ):
        query = self.db.query(Card)

        if tgc_id is not None:
            query = query.filter(Card.tgc_id == tgc_id)

        normalized_search = self._normalize_filter_value(search)
        if normalized_search:
            pattern = f"%{self._escape_like_pattern(normalized_search)}%"
            query = query.filter(
                or_(
                    Card.name.ilike(pattern, escape="\\"),
                    Card.source_card_id.ilike(pattern, escape="\\"),
                )
            )

        query = self._apply_normalized_exact_filter(query, Card.card_type, card_type, tgc_id)
        query = self._apply_normalized_exact_filter(query, Card.color, color, tgc_id)
        query = self._apply_normalized_exact_filter(query, Card.rarity, rarity, tgc_id)
        query = self._apply_normalized_exact_filter(query, Card.set_name, set_name, tgc_id)

        return query

    def get_all_cards(self, tgc_id: Optional[int] = None) -> List[Card]:
        query = self.db.query(Card)
        if tgc_id is not None:
            query = query.filter(Card.tgc_id == tgc_id)
        return [self.serialize_card(card) for card in query.order_by(Card.name.asc()).all()]

    def get_cards_page(
        self,
        tgc_id: Optional[int] = None,
        search: Optional[str] = None,
        card_type: Optional[str] = None,
        color: Optional[str] = None,
        rarity: Optional[str] = None,
        set_name: Optional[str] = None,
        page: int = 1,
        limit: int = 100,
    ):
        query = self._build_cards_query(
            tgc_id=tgc_id,
            search=search,
            card_type=card_type,
            color=color,
            rarity=rarity,
            set_name=set_name,
        )

        total = query.count()
        total_pages = math.ceil(total / limit) if total else 0
        current_page = min(page, total_pages) if total_pages else 1
        offset = (current_page - 1) * limit

        items = (
            query.order_by(Card.name.asc(), Card.id.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        return {
            "items": [self.serialize_card(card) for card in items],
            "page": current_page,
            "limit": limit,
            "total": total,
            "total_pages": total_pages,
            "has_previous": current_page > 1,
            "has_next": total_pages > 0 and current_page < total_pages,
        }

    def _get_distinct_card_values(self, column, tgc_id: Optional[int] = None):
        query = self.db.query(column).filter(column.isnot(None), column != "")

        if tgc_id is not None:
            query = query.filter(Card.tgc_id == tgc_id)

        rows = query.distinct().all()
        values = [value for value, in rows if value]
        return sorted(values, key=lambda value: value.lower())

    def _get_normalized_distinct_card_values(self, column, tgc_id: Optional[int] = None):
        normalized_values = {}

        for raw_value in self._get_distinct_card_values(column, tgc_id):
            normalized_value = self._normalize_card_value(raw_value)
            if not normalized_value:
                continue

            normalized_values.setdefault(normalized_value.lower(), normalized_value)

        return sorted(normalized_values.values(), key=lambda value: value.lower())

    def _get_normalized_distinct_set_names(self, tgc_id: Optional[int] = None):
        query = (
            self.db.query(Card.set_name, Card.card_type, Card.tgc_id)
            .filter(Card.set_name.isnot(None), Card.set_name != "")
        )

        if tgc_id is not None:
            query = query.filter(Card.tgc_id == tgc_id)

        normalized_values = {}

        for raw_set_name, raw_card_type, raw_tgc_id in query.distinct().all():
            normalized_set_name = self._normalize_set_name(raw_set_name, raw_card_type, raw_tgc_id)
            if not normalized_set_name:
                continue

            normalized_values.setdefault(normalized_set_name.lower(), normalized_set_name)

        return sorted(normalized_values.values(), key=lambda value: value.lower())

    def get_card_facets(self, tgc_id: Optional[int] = None):
        return {
            "card_types": self._get_normalized_distinct_card_values(Card.card_type, tgc_id),
            "colors": self._get_normalized_distinct_card_values(Card.color, tgc_id),
            "rarities": self._get_normalized_distinct_card_values(Card.rarity, tgc_id),
            "set_names": self._get_normalized_distinct_set_names(tgc_id),
        }

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
        collection_card_ids = [col.card_id for col in collections]
        default_tgc_id = self._get_default_tgc_id() if tgc_id is not None else None
        deck_rows_by_card_id = defaultdict(list)

        if collection_card_ids:
            deck_query = (
                self.db.query(
                    Deck.id.label("deck_id"),
                    Deck.name.label("deck_name"),
                    DeckCard.card_id.label("card_id"),
                    DeckCard.quantity.label("quantity"),
                    DeckCard.assigned_quantity.label("assigned_quantity"),
                )
                .join(DeckCard, Deck.id == DeckCard.deck_id)
                .filter(Deck.user_id == user_id, DeckCard.card_id.in_(collection_card_ids))
            )

            if tgc_id is not None:
                if default_tgc_id and tgc_id == default_tgc_id:
                    deck_query = deck_query.filter(or_(Deck.tgc_id == tgc_id, Deck.tgc_id.is_(None)))
                else:
                    deck_query = deck_query.filter(Deck.tgc_id == tgc_id)

            for deck_row in deck_query.all():
                deck_rows_by_card_id[deck_row.card_id].append(deck_row)

        result = []
        for col in collections:
            deck_rows = deck_rows_by_card_id.get(col.card_id, [])
            used_in_decks = sum(
                (
                    deck_row.assigned_quantity
                    if advanced_mode and deck_row.assigned_quantity is not None
                    else deck_row.quantity
                )
                for deck_row in deck_rows
            )
            result.append({
                "card": self.serialize_card(col.card),
                "total_quantity": col.quantity,
                "available_quantity": max(col.quantity - used_in_decks, 0),
                "decks": [
                    {
                        "id": deck_row.deck_id,
                        "name": deck_row.deck_name,
                        "quantity": deck_row.quantity,
                    }
                    for deck_row in deck_rows
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
