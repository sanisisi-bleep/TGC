import math
import re
from collections import defaultdict
from typing import List, Optional

from sqlalchemy import func, literal, or_
from sqlalchemy.orm import Session, joinedload, load_only

from app.models import Card, Deck, DeckCard, DeckEggCard, Tgc, User, UserCollection
from app.database.repositories.card_repository import CardRepository
from app.services.game_rules import DIGIMON_TCG_NAME, GUNDAM_TGC_NAME, ONE_PIECE_TCG_NAME, get_one_piece_card_role
from app.services.image_service import (
    build_card_thumbnail_url,
    resolve_card_image_url,
)

SUPPORTED_CARD_SORTS = {"name-asc", "collection-asc", "collection-desc"}

class CardService:
    def __init__(self, db: Session):
        self.db = db
        self.card_repo = CardRepository(db)
        self._tgc_name_cache = {}

    def _serialize_card_summary_base(self, card: Card):
        image_url = self._resolve_card_image_url(card)
        return {
            "id": card.id,
            "tgc_id": card.tgc_id,
            "source_card_id": card.source_card_id,
            "deck_key": card.deck_key or card.source_card_id,
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
            "image_url": image_url,
            "thumbnail_url": build_card_thumbnail_url(image_url),
        }

    def _serialize_card_base(self, card: Card):
        payload = self._serialize_card_summary_base(card)
        payload.update(
            {
                "traits": card.traits,
                "link": card.link,
                "zones": card.zones,
                "artist": card.artist,
                "abilities": card.abilities,
                "description": card.description,
            }
        )
        return payload

    def serialize_card_summary(self, card: Card):
        return self._serialize_card_summary_base(card)

    def serialize_card(self, card: Card):
        payload = self._serialize_card_base(card)

        if card.digimon_data:
            payload.update(
                {
                    "dp": card.digimon_data.dp,
                    "form": self._normalize_card_value(card.digimon_data.form),
                    "attribute": self._normalize_card_value(card.digimon_data.attribute),
                    "type_line": card.digimon_data.type_line,
                    "digivolution_requirements": card.digimon_data.digivolution_requirements,
                    "special_digivolution": card.digimon_data.special_digivolution,
                    "inherited_effect": card.digimon_data.inherited_effect,
                    "security_effect": card.digimon_data.security_effect,
                    "rule_text": card.digimon_data.rule_text,
                    "notes": card.digimon_data.notes,
                    "qa": card.digimon_data.qa,
                    "is_alternative_art": bool(card.digimon_data.is_alternative_art),
                }
            )

        if card.one_piece_data:
            payload.update(
                {
                    "attribute_name": self._normalize_card_value(card.one_piece_data.attribute_name),
                    "attribute_image": self._normalize_card_value(card.one_piece_data.attribute_image),
                    "power": card.one_piece_data.power,
                    "family": card.one_piece_data.family,
                    "ability": card.one_piece_data.ability,
                    "counter": self._normalize_card_value(card.one_piece_data.counter),
                    "trigger": card.one_piece_data.trigger,
                    "notes": card.one_piece_data.notes,
                    "qa": card.one_piece_data.qa,
                }
            )

        if card.gundam_data:
            payload.update(
                {
                    "source_title": self._normalize_card_value(card.gundam_data.source_title),
                    "get_it": self._normalize_card_value(card.gundam_data.get_it),
                    "qa": card.gundam_data.qa,
                }
            )

        return payload

    def _resolve_card_image_url(self, card: Card):
        return resolve_card_image_url(
            card.image_url,
            source_card_id=card.source_card_id,
            tgc_name=self._get_tgc_name(card.tgc_id),
        )

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

    def _normalize_collection_code(self, value: Optional[str]) -> Optional[str]:
        normalized_value = self._normalize_card_value(value)
        if not normalized_value:
            return None

        compact_value = re.sub(r"[^A-Za-z0-9]+", "", normalized_value).upper()
        return compact_value or None

    def _build_collection_code_aliases(self, value: Optional[str]):
        normalized_code = self._normalize_collection_code(value)
        if not normalized_code:
            return []

        aliases = {normalized_code}
        match = re.fullmatch(r"([A-Z]+)0*(\d+)", normalized_code)

        if match:
            prefix, raw_digits = match.groups()
            numeric_value = int(raw_digits)
            aliases.add(f"{prefix}{numeric_value}")
            aliases.add(f"{prefix}{numeric_value:02d}")

        return sorted(aliases)

    def _natural_sort_key(self, value: Optional[str]):
        normalized_value = self._normalize_collection_code(value) or self._normalize_card_value(value) or ""
        tokens = re.findall(r"[A-Z]+|\d+", normalized_value.upper())

        if not tokens:
            return ((0, ""),)

        sort_key = []
        for token in tokens:
            if token.isdigit():
                sort_key.append((1, int(token)))
            else:
                sort_key.append((0, token))
        return tuple(sort_key)

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

    def _apply_set_filter(self, query, value: Optional[str], tgc_id: Optional[int] = None):
        normalized_value = self._normalize_filter_value(value)
        if not normalized_value:
            return query

        if normalized_value == "DON!!" and self._is_one_piece_tgc(tgc_id):
            return query.filter(self._normalized_sql_value(Card.card_type).like("%don%"))

        conditions = [
            self._normalized_sql_value(Card.set_name) == normalized_value.lower(),
        ]

        for alias in self._build_collection_code_aliases(normalized_value):
            conditions.append(func.upper(func.trim(Card.version)) == alias)

        return query.filter(or_(*conditions))

    def _apply_sort(self, query, sort: Optional[str]):
        normalized_sort = sort if sort in SUPPORTED_CARD_SORTS else "name-asc"

        if normalized_sort == "collection-asc":
            return query.order_by(
                func.coalesce(Card.version, "").asc(),
                func.coalesce(Card.source_card_id, "").asc(),
                func.coalesce(Card.set_name, "").asc(),
                Card.name.asc(),
                Card.id.asc(),
            )

        if normalized_sort == "collection-desc":
            return query.order_by(
                func.coalesce(Card.version, "").desc(),
                func.coalesce(Card.source_card_id, "").desc(),
                func.coalesce(Card.set_name, "").desc(),
                Card.name.desc(),
                Card.id.desc(),
            )

        return query.order_by(Card.name.asc(), Card.id.asc())

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
            search_conditions = [
                Card.name.ilike(pattern, escape="\\"),
                Card.source_card_id.ilike(pattern, escape="\\"),
                Card.set_name.ilike(pattern, escape="\\"),
                Card.version.ilike(pattern, escape="\\"),
            ]

            for alias in self._build_collection_code_aliases(normalized_search):
                search_conditions.append(func.upper(func.trim(Card.version)) == alias)

            query = query.filter(
                or_(*search_conditions)
            )

        query = self._apply_normalized_exact_filter(query, Card.card_type, card_type, tgc_id)
        query = self._apply_normalized_exact_filter(query, Card.color, color, tgc_id)
        query = self._apply_normalized_exact_filter(query, Card.rarity, rarity, tgc_id)
        query = self._apply_set_filter(query, set_name, tgc_id)

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
        sort: Optional[str] = None,
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

        card_summary_load = load_only(
            Card.id,
            Card.tgc_id,
            Card.source_card_id,
            Card.deck_key,
            Card.name,
            Card.card_type,
            Card.lv,
            Card.cost,
            Card.ap,
            Card.hp,
            Card.color,
            Card.rarity,
            Card.set_name,
            Card.version,
            Card.block,
            Card.image_url,
        )
        sorted_query = self._apply_sort(query, sort).options(card_summary_load)
        current_page = max(page, 1)
        offset = (current_page - 1) * limit

        paged_rows = (
            sorted_query
            .add_columns(func.count().over().label("total_count"))
            .offset(offset)
            .limit(limit)
            .all()
        )

        total = int(paged_rows[0][1]) if paged_rows else 0
        total_pages = math.ceil(total / limit) if total else 0

        if not paged_rows and current_page > 1 and total_pages == 0:
            total = query.order_by(None).count()
            total_pages = math.ceil(total / limit) if total else 0
            current_page = min(current_page, total_pages) if total_pages else 1
            offset = (current_page - 1) * limit

            if total_pages:
                paged_rows = (
                    sorted_query
                    .add_columns(func.count().over().label("total_count"))
                    .offset(offset)
                    .limit(limit)
                    .all()
                )

        items = [card for card, _total_count in paged_rows] if paged_rows else []

        return {
            "items": [self.serialize_card_summary(card) for card in items],
            "page": current_page,
            "limit": limit,
            "total": total,
            "total_pages": total_pages,
            "has_previous": current_page > 1,
            "has_next": total_pages > 0 and current_page < total_pages,
        }

    def get_card_by_id(self, card_id: int):
        card = (
            self.db.query(Card)
            .options(
                joinedload(Card.digimon_data),
                joinedload(Card.one_piece_data),
                joinedload(Card.gundam_data),
            )
            .filter(Card.id == card_id)
            .first()
        )
        if not card:
            raise ValueError("Card not found")
        return self.serialize_card(card)

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
        return [option["label"] for option in self._get_set_options(tgc_id)]

    def _get_set_options(self, tgc_id: Optional[int] = None):
        query = (
            self.db.query(Card.set_name, Card.version, Card.card_type, Card.tgc_id)
            .filter(Card.set_name.isnot(None), Card.set_name != "")
        )

        if tgc_id is not None:
            query = query.filter(Card.tgc_id == tgc_id)

        normalized_values = {}

        for raw_set_name, raw_version, raw_card_type, raw_tgc_id in query.distinct().all():
            normalized_set_name = self._normalize_set_name(raw_set_name, raw_card_type, raw_tgc_id)
            if not normalized_set_name:
                continue

            option_key = normalized_set_name.lower()
            option = normalized_values.setdefault(
                option_key,
                {
                    "value": normalized_set_name,
                    "label": normalized_set_name,
                    "versions": set(),
                },
            )

            normalized_version = self._normalize_collection_code(raw_version)
            if normalized_version:
                option["versions"].add(normalized_version)

        options = []
        for option in normalized_values.values():
            versions = sorted(option["versions"], key=self._natural_sort_key)
            options.append(
                {
                    "value": option["value"],
                    "label": option["label"],
                    "versions": versions,
                }
            )

        return sorted(
            options,
            key=lambda option: (
                self._natural_sort_key(option["versions"][0] if option["versions"] else option["label"]),
                option["label"].lower(),
            ),
        )

    def get_card_facets(self, tgc_id: Optional[int] = None):
        return {
            "card_types": self._get_normalized_distinct_card_values(Card.card_type, tgc_id),
            "colors": self._get_normalized_distinct_card_values(Card.color, tgc_id),
            "rarities": self._get_normalized_distinct_card_values(Card.rarity, tgc_id),
            "set_names": self._get_normalized_distinct_set_names(tgc_id),
            "set_options": self._get_set_options(tgc_id),
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
            .options(
                joinedload(UserCollection.card).options(
                    load_only(
                        Card.id,
                        Card.tgc_id,
                        Card.source_card_id,
                        Card.deck_key,
                        Card.name,
                        Card.card_type,
                        Card.lv,
                        Card.cost,
                        Card.ap,
                        Card.hp,
                        Card.color,
                        Card.rarity,
                        Card.set_name,
                        Card.version,
                        Card.block,
                        Card.image_url,
                    ),
                ),
            )
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
                    literal("main").label("deck_section"),
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

            egg_deck_query = (
                self.db.query(
                    Deck.id.label("deck_id"),
                    Deck.name.label("deck_name"),
                    DeckEggCard.card_id.label("card_id"),
                    DeckEggCard.quantity.label("quantity"),
                    DeckEggCard.assigned_quantity.label("assigned_quantity"),
                    literal("egg").label("deck_section"),
                )
                .join(DeckEggCard, Deck.id == DeckEggCard.deck_id)
                .filter(Deck.user_id == user_id, DeckEggCard.card_id.in_(collection_card_ids))
            )

            if tgc_id is not None:
                if default_tgc_id and tgc_id == default_tgc_id:
                    egg_deck_query = egg_deck_query.filter(or_(Deck.tgc_id == tgc_id, Deck.tgc_id.is_(None)))
                else:
                    egg_deck_query = egg_deck_query.filter(Deck.tgc_id == tgc_id)

            for deck_row in egg_deck_query.all():
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
                "card": self.serialize_card_summary(col.card),
                "total_quantity": col.quantity,
                "available_quantity": max(col.quantity - used_in_decks, 0),
                "decks": [
                    {
                        "id": deck_row.deck_id,
                        "name": deck_row.deck_name,
                        "quantity": deck_row.quantity,
                        "assigned_quantity": deck_row.assigned_quantity,
                        "section": getattr(deck_row, "deck_section", "main"),
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
