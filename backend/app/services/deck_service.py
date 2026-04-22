import secrets
from typing import List, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import Card, Deck, DeckCard, Tgc, User, UserCollection
from app.services.game_rules import (
    GUNDAM_TGC_NAME,
    ONE_PIECE_TCG_NAME,
    get_gundam_colors,
    get_one_piece_card_role,
    get_one_piece_colors,
    get_tcg_rules,
)
from app.services.image_service import normalize_card_image_url


class DeckService:
    def __init__(self, db: Session):
        self.db = db

    def _get_user_deck_or_error(self, deck_id: int, user_id: int) -> Deck:
        deck = self.db.query(Deck).filter(Deck.id == deck_id, Deck.user_id == user_id).first()
        if not deck:
            raise ValueError("Deck not found")
        return deck

    def _get_deck_card_or_error(self, deck_id: int, card_id: int) -> DeckCard:
        deck_card = self.db.query(DeckCard).filter(DeckCard.deck_id == deck_id, DeckCard.card_id == card_id).first()
        if not deck_card:
            raise ValueError("Card not found in deck")
        return deck_card

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

    def _is_one_piece_tgc(self, deck_tgc) -> bool:
        return bool(deck_tgc and deck_tgc.name == ONE_PIECE_TCG_NAME)

    def _is_gundam_tgc(self, deck_tgc) -> bool:
        return bool(deck_tgc and deck_tgc.name == GUNDAM_TGC_NAME)

    def _get_card_role(self, deck_tgc, card: Card) -> str:
        if self._is_one_piece_tgc(deck_tgc):
            return get_one_piece_card_role(card.card_type)
        return "main"

    def _get_card_colors(self, deck_tgc, card: Card) -> set[str]:
        if self._is_one_piece_tgc(deck_tgc):
            return set(get_one_piece_colors(card.color))
        if self._is_gundam_tgc(deck_tgc):
            return set(get_gundam_colors(card.color))
        return set()

    def _get_card_quantity_limit(self, deck_tgc, rules: dict, card: Card) -> int:
        if self._is_one_piece_tgc(deck_tgc):
            role = self._get_card_role(deck_tgc, card)
            if role == "leader":
                return rules["required_leader_cards"]
            if role == "don":
                return rules["max_don_cards"]
        return rules["max_copies_per_card"]

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
                "deck_card": deck_card,
                "card": card,
                "quantity": deck_card.quantity,
            }
            for deck_card, card in rows
        ]

    def _build_candidate_deck_entries(self, deck_id: int, target_card: Card, next_quantity: int):
        entries = self._get_deck_entries(deck_id)
        replaced = False
        candidate_entries = []

        for entry in entries:
            if entry["card"].id == target_card.id:
                replaced = True
                if next_quantity > 0:
                    candidate_entries.append(
                        {
                            "deck_card": entry["deck_card"],
                            "card": entry["card"],
                            "quantity": next_quantity,
                        }
                    )
                continue

            candidate_entries.append(entry)

        if not replaced and next_quantity > 0:
            candidate_entries.append(
                {
                    "deck_card": None,
                    "card": target_card,
                    "quantity": next_quantity,
                }
            )

        return candidate_entries

    def _build_generic_deck_composition(self, rules: dict, deck_entries: List[dict]):
        total_cards = sum(entry["quantity"] for entry in deck_entries)
        required_main_cards = rules.get("required_main_deck_cards") or rules["deck_max_cards"]
        max_main_cards = rules.get("max_main_deck_cards") or rules["deck_max_cards"]

        return {
            "format_mode": "standard",
            "leader_cards": 0,
            "required_leader_cards": rules.get("required_leader_cards", 0),
            "main_deck_cards": total_cards,
            "required_main_deck_cards": required_main_cards,
            "max_main_deck_cards": max_main_cards,
            "missing_main_deck_cards": max(required_main_cards - total_cards, 0),
            "extra_main_deck_cards": max(total_cards - max_main_cards, 0),
            "don_cards": 0,
            "recommended_don_cards": rules.get("max_don_cards", 0),
            "don_is_optional": rules.get("allow_optional_don_deck", False),
            "missing_don_cards": 0,
            "extra_don_cards": 0,
            "leader_color_labels": [],
            "deck_color_labels": [],
            "max_deck_colors": rules.get("max_deck_colors", 0),
            "off_color_cards": [],
            "copy_limit_exceeded_cards": [],
            "color_match_ready": False,
            "is_color_valid": True,
            "is_valid": total_cards >= rules["deck_min_cards"] and total_cards <= rules["deck_max_cards"],
        }

    def _build_gundam_deck_composition(self, rules: dict, deck_entries: List[dict]):
        total_cards = sum(entry["quantity"] for entry in deck_entries)
        max_deck_colors = max(int(rules.get("max_deck_colors") or 0), 0)
        deck_color_labels = []
        deck_color_set = set()
        off_color_cards = []
        copy_counts_by_code = {}
        main_card_names = {}

        for entry in deck_entries:
            card = entry["card"]
            quantity = entry["quantity"]
            source_card_id = (card.source_card_id or f"CARD-{card.id}").strip()
            copy_counts_by_code[source_card_id] = copy_counts_by_code.get(source_card_id, 0) + quantity
            main_card_names[source_card_id] = card.name

            card_colors = get_gundam_colors(card.color)
            if not card_colors:
                continue

            for color in card_colors:
                if color in deck_color_set:
                    continue
                if len(deck_color_labels) < max_deck_colors:
                    deck_color_labels.append(color)
                    deck_color_set.add(color)

            overflow_colors = [color for color in card_colors if color not in deck_color_set]
            if overflow_colors:
                off_color_cards.append(
                    {
                        "id": card.id,
                        "name": card.name,
                        "quantity": quantity,
                        "color": card.color or "",
                        "overflow_colors": overflow_colors,
                    }
                )

        copy_limit_exceeded_cards = [
            {
                "source_card_id": source_card_id,
                "name": main_card_names.get(source_card_id) or source_card_id,
                "quantity": quantity,
            }
            for source_card_id, quantity in copy_counts_by_code.items()
            if quantity > rules["max_copies_per_card"]
        ]

        return {
            "format_mode": "gundam",
            "leader_cards": 0,
            "required_leader_cards": 0,
            "main_deck_cards": total_cards,
            "required_main_deck_cards": rules["required_main_deck_cards"],
            "max_main_deck_cards": rules["max_main_deck_cards"],
            "missing_main_deck_cards": max(rules["required_main_deck_cards"] - total_cards, 0),
            "extra_main_deck_cards": max(total_cards - rules["max_main_deck_cards"], 0),
            "don_cards": 0,
            "recommended_don_cards": 0,
            "don_is_optional": False,
            "missing_don_cards": 0,
            "extra_don_cards": 0,
            "leader_color_labels": [],
            "deck_color_labels": deck_color_labels,
            "max_deck_colors": max_deck_colors,
            "off_color_cards": off_color_cards,
            "copy_limit_exceeded_cards": copy_limit_exceeded_cards,
            "color_match_ready": bool(deck_color_labels),
            "is_color_valid": not off_color_cards,
            "is_valid": (
                total_cards == rules["required_main_deck_cards"]
                and not off_color_cards
                and not copy_limit_exceeded_cards
            ),
        }

    def _build_one_piece_deck_composition(self, rules: dict, deck_entries: List[dict]):
        leader_cards = 0
        main_deck_cards = 0
        don_cards = 0
        leader_color_labels = []
        leader_color_set = set()
        main_entries = []
        copy_counts_by_code = {}
        main_card_names = {}

        for entry in deck_entries:
            card = entry["card"]
            quantity = entry["quantity"]
            role = get_one_piece_card_role(card.card_type)
            colors = set(get_one_piece_colors(card.color))

            if role == "leader":
                leader_cards += quantity
                if quantity > 0:
                    leader_color_labels = sorted(colors)
                    leader_color_set = set(leader_color_labels)
                continue

            if role == "don":
                don_cards += quantity
                continue

            main_deck_cards += quantity
            main_entries.append(
                {
                    "card": card,
                    "quantity": quantity,
                    "colors": colors,
                }
            )
            source_card_id = (card.source_card_id or f"CARD-{card.id}").strip()
            copy_counts_by_code[source_card_id] = copy_counts_by_code.get(source_card_id, 0) + quantity
            main_card_names[source_card_id] = card.name

        off_color_cards = []
        if leader_cards == 1 and leader_color_set:
            for entry in main_entries:
                if leader_color_set.isdisjoint(entry["colors"]):
                    off_color_cards.append(
                        {
                            "id": entry["card"].id,
                            "name": entry["card"].name,
                            "quantity": entry["quantity"],
                            "color": entry["card"].color or "",
                        }
                    )

        copy_limit_exceeded_cards = [
            {
                "source_card_id": source_card_id,
                "name": main_card_names.get(source_card_id) or source_card_id,
                "quantity": quantity,
            }
            for source_card_id, quantity in copy_counts_by_code.items()
            if quantity > rules["max_copies_per_card"]
        ]
        don_is_ready = don_cards == 0 or don_cards == rules["max_don_cards"]
        missing_don_cards = 0 if don_cards == 0 else max(rules["max_don_cards"] - don_cards, 0)

        return {
            "format_mode": "one-piece",
            "leader_cards": leader_cards,
            "required_leader_cards": rules["required_leader_cards"],
            "main_deck_cards": main_deck_cards,
            "required_main_deck_cards": rules["required_main_deck_cards"],
            "max_main_deck_cards": rules["max_main_deck_cards"],
            "missing_main_deck_cards": max(rules["required_main_deck_cards"] - main_deck_cards, 0),
            "extra_main_deck_cards": max(main_deck_cards - rules["max_main_deck_cards"], 0),
            "don_cards": don_cards,
            "recommended_don_cards": rules["max_don_cards"],
            "don_is_optional": rules["allow_optional_don_deck"],
            "missing_don_cards": missing_don_cards,
            "extra_don_cards": max(don_cards - rules["max_don_cards"], 0),
            "leader_color_labels": leader_color_labels,
            "deck_color_labels": leader_color_labels,
            "max_deck_colors": 0,
            "off_color_cards": off_color_cards,
            "copy_limit_exceeded_cards": copy_limit_exceeded_cards,
            "color_match_ready": leader_cards == 1 and bool(leader_color_labels),
            "is_color_valid": leader_cards == 1 and bool(leader_color_labels) and not off_color_cards,
            "is_valid": (
                leader_cards == rules["required_leader_cards"]
                and main_deck_cards == rules["required_main_deck_cards"]
                and don_is_ready
                and bool(leader_color_labels)
                and not off_color_cards
                and not copy_limit_exceeded_cards
            ),
        }

    def _build_deck_composition(self, deck_tgc, rules: dict, deck_entries: List[dict]):
        if self._is_one_piece_tgc(deck_tgc):
            return self._build_one_piece_deck_composition(rules, deck_entries)
        if self._is_gundam_tgc(deck_tgc):
            return self._build_gundam_deck_composition(rules, deck_entries)
        return self._build_generic_deck_composition(rules, deck_entries)

    def _validate_generic_quantity_rules(self, deck_tgc, rules: dict, next_quantity: int, next_total: int, card: Card):
        card_limit = self._get_card_quantity_limit(deck_tgc, rules, card)
        if next_quantity > card_limit:
            raise ValueError(
                f"You can only have up to {card_limit} copies of this card in this deck"
            )

        if not self._is_one_piece_tgc(deck_tgc) and next_total > rules["deck_max_cards"]:
            raise ValueError(
                f"{deck_tgc.name if deck_tgc else 'This TCG'} decks cannot exceed {rules['deck_max_cards']} cards"
            )

    def _validate_one_piece_composition(self, rules: dict, composition: dict, card: Card, is_increase: bool, require_complete: bool):
        role = get_one_piece_card_role(card.card_type) if card else "main"

        if composition["leader_cards"] > rules["required_leader_cards"]:
            raise ValueError("Los mazos de One Piece solo pueden llevar 1 Leader.")

        if composition["main_deck_cards"] > rules["max_main_deck_cards"]:
            raise ValueError("El mazo principal de One Piece no puede superar 50 cartas.")

        if composition["don_cards"] > rules["max_don_cards"]:
            raise ValueError("El mazo DON!! de One Piece no puede superar 10 cartas.")

        if composition["copy_limit_exceeded_cards"]:
            exceeded_card = composition["copy_limit_exceeded_cards"][0]
            raise ValueError(
                f"En One Piece solo puedes llevar hasta 4 copias del numero {exceeded_card['source_card_id']}."
            )

        if composition["leader_cards"] == 1 and not composition["leader_color_labels"]:
            raise ValueError("No se han podido detectar los colores del Leader de One Piece.")

        if is_increase and role == "main" and composition["leader_cards"] == 0:
            raise ValueError("En One Piece anade primero 1 Leader antes de meter cartas al mazo.")

        if composition["off_color_cards"]:
            invalid_names = ", ".join(card_info["name"] for card_info in composition["off_color_cards"][:3])
            raise ValueError(
                f"Todas las cartas del mazo principal deben compartir color con tu Leader. Revisa: {invalid_names}."
            )

        if require_complete:
            if composition["leader_cards"] != rules["required_leader_cards"]:
                raise ValueError("Un mazo de One Piece necesita exactamente 1 Leader.")

            if composition["main_deck_cards"] != rules["required_main_deck_cards"]:
                raise ValueError("El mazo principal de One Piece debe tener exactamente 50 cartas.")

            if 0 < composition["don_cards"] < rules["max_don_cards"]:
                raise ValueError("Si anades cartas DON!!, el mazo DON!! debe tener exactamente 10 cartas.")

    def _validate_gundam_composition(self, rules: dict, composition: dict, require_complete: bool):
        if composition["main_deck_cards"] > rules["max_main_deck_cards"]:
            raise ValueError("El mazo de Gundam no puede superar 50 cartas.")

        if composition["copy_limit_exceeded_cards"]:
            exceeded_card = composition["copy_limit_exceeded_cards"][0]
            raise ValueError(
                f"En Gundam solo puedes llevar hasta 4 copias del numero {exceeded_card['source_card_id']}."
            )

        if composition["off_color_cards"]:
            invalid_card = composition["off_color_cards"][0]
            locked_colors = composition.get("deck_color_labels") or []
            if locked_colors:
                raise ValueError(
                    "En Gundam un mazo solo puede fijar hasta 2 colores. "
                    f"Este mazo ya usa {' / '.join(locked_colors)} y {invalid_card['name']} "
                    f"introduce {' / '.join(invalid_card.get('overflow_colors') or [invalid_card.get('color') or 'otro color'])}."
                )
            raise ValueError("En Gundam un mazo solo puede fijar hasta 2 colores.")

        if require_complete and composition["main_deck_cards"] != rules["required_main_deck_cards"]:
            raise ValueError("Un mazo de Gundam debe tener exactamente 50 cartas.")

    def _validate_deck_composition(self, deck_tgc, rules: dict, deck_entries: List[dict], card: Card, is_increase: bool = False, require_complete: bool = False):
        composition = self._build_deck_composition(deck_tgc, rules, deck_entries)

        if self._is_one_piece_tgc(deck_tgc):
            self._validate_one_piece_composition(rules, composition, card, is_increase, require_complete)
        elif self._is_gundam_tgc(deck_tgc):
            self._validate_gundam_composition(rules, composition, require_complete)

        return composition

    def _serialize_shared_deck_card(self, deck_tgc, rules: dict, deck_card: DeckCard, card: Card, composition: dict):
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
            "deck_role": role,
            "max_quantity_allowed": self._get_card_quantity_limit(deck_tgc, rules, card),
            "color_matches_leader": color_matches_rule,
            "color_warning_text": color_warning_text,
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
                if self._is_one_piece_tgc(deck_tgc)
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
            "leader_color_labels": composition["leader_color_labels"],
            "deck_color_labels": composition.get("deck_color_labels", []),
            "max_deck_colors": composition.get("max_deck_colors", 0),
            "off_color_cards": composition["off_color_cards"],
        }

    def _serialize_deck_payload(self, deck: Deck, deck_tgc, rules: dict, user_id: Optional[int] = None, include_share_token: bool = False):
        deck_entries = self._get_deck_entries(deck.id)
        composition = self._build_deck_composition(deck_tgc, rules, deck_entries)
        total_cards = sum(entry["quantity"] for entry in deck_entries)
        advanced_mode = self._is_advanced_mode_enabled(user_id) if user_id is not None else False
        owned_quantities = self._get_owned_quantities_map(
            user_id,
            [entry["card"].id for entry in deck_entries],
        ) if user_id is not None else {}

        serialized_cards = []
        missing_copies = 0

        for entry in deck_entries:
            deck_card = entry["deck_card"]
            card = entry["card"]
            base_payload = self._serialize_shared_deck_card(deck_tgc, rules, deck_card, card, composition)

            if user_id is not None:
                owned_quantity = owned_quantities.get(card.id, 0)
                fulfilled_quantity = self._resolve_covered_quantity(deck_card, owned_quantity, advanced_mode)
                missing_quantity = max(deck_card.quantity - fulfilled_quantity, 0)
                missing_copies += missing_quantity
                base_payload.update(
                    {
                        "assigned_quantity": deck_card.assigned_quantity,
                        "owned_quantity": owned_quantity,
                        "fulfilled_quantity": fulfilled_quantity,
                        "missing_quantity": missing_quantity,
                        "manual_assignment_active": advanced_mode and deck_card.assigned_quantity is not None,
                    }
                )

            serialized_cards.append(base_payload)

        role_order = {"leader": 0, "main": 1, "don": 2}
        serialized_cards.sort(
            key=lambda item: (
                role_order.get(item["deck_role"], 9),
                item["cost"] if item["cost"] is not None else 999,
                item["name"].lower(),
                item["source_card_id"] or "",
            )
        )

        response = self._build_deck_response_base(deck, deck_tgc, rules, composition, total_cards)
        response["cards"] = serialized_cards

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

    def get_deck_details(self, deck_id: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)
        return self._serialize_deck_payload(deck, deck_tgc, rules, user_id=user_id)

    def get_deck_summary(self, deck_id: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)
        return self._serialize_deck_payload(deck, deck_tgc, rules)

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
        deck_entries = []

        for raw_card in cards:
            quantity = int(raw_card.get("quantity") or 0)
            if quantity <= 0:
                raise ValueError("Imported card quantity must be greater than zero")

            card = self._resolve_import_card(resolved_tgc_id, raw_card)
            current_quantity = aggregated_cards.get(card.id, 0)
            aggregated_cards[card.id] = current_quantity + quantity

        for card_id, quantity in aggregated_cards.items():
            card = self.db.query(Card).filter(Card.id == card_id).first()
            deck_entries.append(
                {
                    "deck_card": None,
                    "card": card,
                    "quantity": quantity,
                }
            )

        self._validate_deck_composition(
            target_tgc,
            rules,
            deck_entries,
            deck_entries[0]["card"] if deck_entries else None,
            require_complete=True,
        )

        deck_name = (name or "").strip() or "Mazo importado"
        deck = Deck(user_id=user_id, tgc_id=resolved_tgc_id, name=deck_name[:100])
        self.db.add(deck)
        self.db.flush()

        for entry in deck_entries:
            self.db.add(
                DeckCard(
                    deck_id=deck.id,
                    card_id=entry["card"].id,
                    quantity=entry["quantity"],
                )
            )

        self.db.commit()
        self.db.refresh(deck)
        return deck

    def rename_deck(self, deck_id: int, user_id: int, name: str):
        deck = self._get_user_deck_or_error(deck_id, user_id)

        cleaned_name = (name or "").strip()
        if not cleaned_name:
            raise ValueError("Deck name cannot be empty")

        deck.name = cleaned_name[:100]
        self.db.commit()
        self.db.refresh(deck)
        return deck

    def delete_deck(self, deck_id: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)

        self.db.query(DeckCard).filter(DeckCard.deck_id == deck.id).delete(synchronize_session=False)
        self.db.delete(deck)
        self.db.commit()
        return deck

    def clone_deck(self, deck_id: int, user_id: int):
        source_deck = self._get_user_deck_or_error(deck_id, user_id)

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
        deck = self._get_user_deck_or_error(deck_id, user_id)

        if not deck.share_token:
            deck.share_token = self._generate_share_token()
            self.db.commit()
            self.db.refresh(deck)

        return deck

    def get_shared_deck(self, share_token: str):
        deck = self.db.query(Deck).filter(Deck.share_token == share_token).first()
        if not deck:
            raise ValueError("Shared deck not found")

        deck_tgc, rules = self._get_rules_for_deck(deck)
        return self._serialize_deck_payload(deck, deck_tgc, rules, include_share_token=True)

    def add_card_to_deck(self, deck_id: int, card_id: int, quantity: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)

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

        self._validate_generic_quantity_rules(deck_tgc, rules, next_quantity, next_total, card)
        candidate_entries = self._build_candidate_deck_entries(deck_id, card, next_quantity)
        self._validate_deck_composition(deck_tgc, rules, candidate_entries, card, is_increase=True)

        if deck_card:
            deck_card.quantity = next_quantity
            if deck_card.assigned_quantity is not None:
                deck_card.assigned_quantity = min(deck_card.assigned_quantity, deck_card.quantity)
        else:
            deck_card = DeckCard(deck_id=deck_id, card_id=card_id, quantity=quantity)
            self.db.add(deck_card)

        self.db.commit()
        self.db.refresh(deck_card)
        return {
            "quantity": deck_card.quantity,
            "assigned_quantity": deck_card.assigned_quantity,
        }

    def adjust_deck_card_quantity(self, deck_id: int, card_id: int, delta: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)
        deck_card = self._get_deck_card_or_error(deck_id, card_id)
        card = self.db.query(Card).filter(Card.id == card_id).first()

        next_quantity = deck_card.quantity + delta
        total_cards_in_deck = self._get_deck_total_quantity(deck_id)
        next_total = total_cards_in_deck - deck_card.quantity + max(next_quantity, 0)

        if next_quantity > 0:
            self._validate_generic_quantity_rules(deck_tgc, rules, next_quantity, next_total, card)

        candidate_entries = self._build_candidate_deck_entries(deck_id, card, max(next_quantity, 0))
        composition = self._validate_deck_composition(
            deck_tgc,
            rules,
            candidate_entries,
            card,
            is_increase=delta > 0,
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
            return {
                "quantity": 0,
                "assigned_quantity": None,
                "deck": deck_overview,
            }

        deck_card.quantity = next_quantity
        if deck_card.assigned_quantity is not None:
            deck_card.assigned_quantity = min(deck_card.assigned_quantity, deck_card.quantity)
        self.db.commit()
        self.db.refresh(deck_card)
        return {
            "quantity": deck_card.quantity,
            "assigned_quantity": deck_card.assigned_quantity,
            "deck": deck_overview,
        }

    def adjust_deck_card_assignment(self, deck_id: int, card_id: int, delta: int, user_id: int):
        self._get_user_deck_or_error(deck_id, user_id)
        deck_card = self._get_deck_card_or_error(deck_id, card_id)

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
            "assigned_quantity": deck_card.assigned_quantity,
        }
