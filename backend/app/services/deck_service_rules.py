from typing import List

from app.models import Card
from app.services.game_rules import (
    DIGIMON_TCG_NAME,
    GUNDAM_TGC_NAME,
    ONE_PIECE_TCG_NAME,
    get_digimon_card_role,
    get_digimon_colors,
    get_gundam_colors,
    get_one_piece_card_role,
    get_one_piece_colors,
)


class DeckServiceRulesMixin:
    def _is_one_piece_tgc(self, deck_tgc) -> bool:
        return bool(deck_tgc and deck_tgc.name == ONE_PIECE_TCG_NAME)

    def _is_gundam_tgc(self, deck_tgc) -> bool:
        return bool(deck_tgc and deck_tgc.name == GUNDAM_TGC_NAME)

    def _is_digimon_tgc(self, deck_tgc) -> bool:
        return bool(deck_tgc and deck_tgc.name == DIGIMON_TCG_NAME)

    def _get_card_role(self, deck_tgc, card: Card) -> str:
        if self._is_one_piece_tgc(deck_tgc):
            return get_one_piece_card_role(card.card_type)
        if self._is_digimon_tgc(deck_tgc):
            return get_digimon_card_role(card.card_type)
        return "main"

    def _get_card_storage_section(self, deck_tgc, card: Card) -> str:
        return "egg" if self._is_digimon_tgc(deck_tgc) and self._get_card_role(deck_tgc, card) == "egg" else "main"

    def _get_card_colors(self, deck_tgc, card: Card) -> set[str]:
        if self._is_one_piece_tgc(deck_tgc):
            return set(get_one_piece_colors(card.color))
        if self._is_gundam_tgc(deck_tgc):
            return set(get_gundam_colors(card.color))
        if self._is_digimon_tgc(deck_tgc):
            return set(get_digimon_colors(card.color))
        return set()

    def _get_copy_limit_key(self, deck_tgc, card: Card) -> str:
        if self._is_digimon_tgc(deck_tgc) or self._is_gundam_tgc(deck_tgc):
            return (card.deck_key or card.source_card_id or f"CARD-{card.id}").strip()
        return (card.source_card_id or f"CARD-{card.id}").strip()

    def _get_card_quantity_limit(self, deck_tgc, rules: dict, card: Card) -> int:
        if self._is_one_piece_tgc(deck_tgc):
            role = self._get_card_role(deck_tgc, card)
            if role == "leader":
                return rules["required_leader_cards"]
            if role == "don":
                return rules["max_don_cards"]
        return rules["max_copies_per_card"]

    def _build_generic_deck_composition(self, rules: dict, deck_entries: List[dict]):
        total_cards = sum(entry["quantity"] for entry in deck_entries if entry["storage_section"] == "main")
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
            "egg_cards": 0,
            "required_egg_cards": rules.get("required_egg_cards", 0),
            "max_egg_cards": rules.get("max_egg_cards", 0),
            "missing_egg_cards": 0,
            "extra_egg_cards": 0,
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
        total_cards = sum(entry["quantity"] for entry in deck_entries if entry["storage_section"] == "main")
        max_deck_colors = max(int(rules.get("max_deck_colors") or 0), 0)
        deck_color_labels = []
        deck_color_set = set()
        off_color_cards = []
        copy_counts_by_code = {}
        main_card_names = {}

        for entry in deck_entries:
            card = entry["card"]
            quantity = entry["quantity"]
            source_card_id = self._get_copy_limit_key(None, card)
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
            "egg_cards": 0,
            "required_egg_cards": 0,
            "max_egg_cards": 0,
            "missing_egg_cards": 0,
            "extra_egg_cards": 0,
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
            source_card_id = self._get_copy_limit_key(None, card)
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
            "egg_cards": 0,
            "required_egg_cards": 0,
            "max_egg_cards": 0,
            "missing_egg_cards": 0,
            "extra_egg_cards": 0,
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

    def _build_digimon_deck_composition(self, rules: dict, deck_entries: List[dict]):
        main_deck_cards = 0
        egg_cards = 0
        copy_counts_by_code = {}
        card_names = {}

        for entry in deck_entries:
            card = entry["card"]
            quantity = entry["quantity"]
            role = get_digimon_card_role(card.card_type)
            source_card_id = (card.deck_key or card.source_card_id or f"CARD-{card.id}").strip()
            copy_counts_by_code[source_card_id] = copy_counts_by_code.get(source_card_id, 0) + quantity
            card_names[source_card_id] = card.name

            if role == "egg":
                egg_cards += quantity
            else:
                main_deck_cards += quantity

        copy_limit_exceeded_cards = [
            {
                "source_card_id": source_card_id,
                "name": card_names.get(source_card_id) or source_card_id,
                "quantity": quantity,
            }
            for source_card_id, quantity in copy_counts_by_code.items()
            if quantity > rules["max_copies_per_card"]
        ]

        return {
            "format_mode": "digimon",
            "leader_cards": 0,
            "required_leader_cards": 0,
            "main_deck_cards": main_deck_cards,
            "required_main_deck_cards": rules["required_main_deck_cards"],
            "max_main_deck_cards": rules["max_main_deck_cards"],
            "missing_main_deck_cards": max(rules["required_main_deck_cards"] - main_deck_cards, 0),
            "extra_main_deck_cards": max(main_deck_cards - rules["max_main_deck_cards"], 0),
            "don_cards": 0,
            "recommended_don_cards": 0,
            "don_is_optional": False,
            "missing_don_cards": 0,
            "extra_don_cards": 0,
            "egg_cards": egg_cards,
            "required_egg_cards": rules.get("required_egg_cards", 0),
            "max_egg_cards": rules.get("max_egg_cards", 0),
            "missing_egg_cards": max((rules.get("required_egg_cards", 0) or 0) - egg_cards, 0),
            "extra_egg_cards": max(egg_cards - (rules.get("max_egg_cards", 0) or 0), 0),
            "leader_color_labels": [],
            "deck_color_labels": [],
            "max_deck_colors": 0,
            "off_color_cards": [],
            "copy_limit_exceeded_cards": copy_limit_exceeded_cards,
            "color_match_ready": False,
            "is_color_valid": True,
            "is_valid": (
                main_deck_cards == rules["required_main_deck_cards"]
                and egg_cards <= (rules.get("max_egg_cards", 0) or 0)
                and not copy_limit_exceeded_cards
            ),
        }

    def _build_deck_composition(self, deck_tgc, rules: dict, deck_entries: List[dict]):
        if self._is_one_piece_tgc(deck_tgc):
            return self._build_one_piece_deck_composition(rules, deck_entries)
        if self._is_gundam_tgc(deck_tgc):
            return self._build_gundam_deck_composition(rules, deck_entries)
        if self._is_digimon_tgc(deck_tgc):
            return self._build_digimon_deck_composition(rules, deck_entries)
        return self._build_generic_deck_composition(rules, deck_entries)

    def _validate_generic_quantity_rules(self, deck_tgc, rules: dict, next_quantity: int, next_total: int, card: Card):
        card_limit = self._get_card_quantity_limit(deck_tgc, rules, card)
        if next_quantity > card_limit:
            raise ValueError(
                f"You can only have up to {card_limit} copies of this card in this deck"
            )

        if not self._is_one_piece_tgc(deck_tgc) and not self._is_digimon_tgc(deck_tgc) and next_total > rules["deck_max_cards"]:
            raise ValueError(
                f"{deck_tgc.name if deck_tgc else 'This TCG'} decks cannot exceed {rules['deck_max_cards']} cards"
            )

    def _validate_considering_quantity_rules(self, deck_tgc, rules: dict, next_quantity: int, card: Card):
        card_limit = self._get_card_quantity_limit(deck_tgc, rules, card)
        if next_quantity > card_limit:
            raise ValueError(
                f"You can only keep up to {card_limit} copies of this card in considering"
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

    def _validate_digimon_composition(self, rules: dict, composition: dict, require_complete: bool):
        if composition["main_deck_cards"] > rules["max_main_deck_cards"]:
            raise ValueError("El mazo principal de Digimon no puede superar 50 cartas.")

        if composition["egg_cards"] > rules["max_egg_cards"]:
            raise ValueError("El Digi-Egg Deck de Digimon no puede superar 5 cartas.")

        if composition["copy_limit_exceeded_cards"]:
            exceeded_card = composition["copy_limit_exceeded_cards"][0]
            raise ValueError(
                f"En Digimon solo puedes llevar hasta 4 copias del numero {exceeded_card['source_card_id']}."
            )

        if require_complete and composition["main_deck_cards"] != rules["required_main_deck_cards"]:
            raise ValueError("Un mazo de Digimon debe tener exactamente 50 cartas en el mazo principal.")

    def _validate_deck_composition(self, deck_tgc, rules: dict, deck_entries: List[dict], card: Card, is_increase: bool = False, require_complete: bool = False):
        composition = self._build_deck_composition(deck_tgc, rules, deck_entries)

        if self._is_one_piece_tgc(deck_tgc):
            self._validate_one_piece_composition(rules, composition, card, is_increase, require_complete)
        elif self._is_gundam_tgc(deck_tgc):
            self._validate_gundam_composition(rules, composition, require_complete)
        elif self._is_digimon_tgc(deck_tgc):
            self._validate_digimon_composition(rules, composition, require_complete)

        return composition
