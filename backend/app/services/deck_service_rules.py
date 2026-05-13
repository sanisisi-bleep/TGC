from typing import List

from app.models import Card
from app.services.game_rules import (
    DIGIMON_TCG_NAME,
    GUNDAM_TCG_NAME,
    ONE_PIECE_TCG_NAME,
    RIFTBOUND_TCG_NAME,
    get_digimon_card_role,
    get_digimon_colors,
    get_gundam_colors,
    get_one_piece_card_role,
    get_one_piece_colors,
    get_riftbound_domains,
    is_tgc_name,
)


class DeckServiceRulesMixin:
    def _is_one_piece_tgc(self, deck_tgc) -> bool:
        return bool(deck_tgc and is_tgc_name(deck_tgc.name, ONE_PIECE_TCG_NAME))

    def _is_gundam_tgc(self, deck_tgc) -> bool:
        return bool(deck_tgc and is_tgc_name(deck_tgc.name, GUNDAM_TCG_NAME))

    def _is_digimon_tgc(self, deck_tgc) -> bool:
        return bool(deck_tgc and is_tgc_name(deck_tgc.name, DIGIMON_TCG_NAME))

    def _is_riftbound_tgc(self, deck_tgc) -> bool:
        return bool(deck_tgc and is_tgc_name(deck_tgc.name, RIFTBOUND_TCG_NAME))

    def _get_card_role(self, deck_tgc, card: Card) -> str:
        if self._is_one_piece_tgc(deck_tgc):
            return get_one_piece_card_role(card.card_type)
        if self._is_digimon_tgc(deck_tgc):
            return get_digimon_card_role(card.card_type)
        if self._is_riftbound_tgc(deck_tgc):
            if card.riftbound_data:
                if card.riftbound_data.is_legend:
                    return "legend"
                if card.riftbound_data.is_rune:
                    return "rune"
                if card.riftbound_data.is_battlefield:
                    return "battlefield"
            return "main"
        return "main"

    def _get_card_storage_section(self, deck_tgc, card: Card) -> str:
        role = self._get_card_role(deck_tgc, card)
        if self._is_digimon_tgc(deck_tgc) and role == "egg":
            return "egg"
        if self._is_riftbound_tgc(deck_tgc) and role in {"legend", "rune", "battlefield", "sideboard"}:
            return role
        return "main"

    def _get_card_colors(self, deck_tgc, card: Card) -> set[str]:
        if self._is_one_piece_tgc(deck_tgc):
            return set(get_one_piece_colors(card.color))
        if self._is_gundam_tgc(deck_tgc):
            return set(get_gundam_colors(card.color))
        if self._is_digimon_tgc(deck_tgc):
            return set(get_digimon_colors(card.color))
        if self._is_riftbound_tgc(deck_tgc):
            return set(get_riftbound_domains(card.riftbound_data.domains if card.riftbound_data else card.color))
        return set()

    def _get_copy_limit_key(self, deck_tgc, card: Card) -> str:
        if self._is_riftbound_tgc(deck_tgc):
            return " ".join((card.name or f"CARD-{card.id}").strip().lower().split())
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
            "banned_cards": [],
            "banned_battlefields": [],
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
            "banned_cards": [],
            "banned_battlefields": [],
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
            "banned_cards": [],
            "banned_battlefields": [],
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
            "banned_cards": [],
            "banned_battlefields": [],
            "color_match_ready": False,
            "is_color_valid": True,
            "is_valid": (
                main_deck_cards == rules["required_main_deck_cards"]
                and egg_cards <= (rules.get("max_egg_cards", 0) or 0)
                and not copy_limit_exceeded_cards
            ),
        }

    def _build_riftbound_deck_composition(self, deck_tgc, deck, rules: dict, deck_entries: List[dict]):
        legend_cards = 0
        main_deck_cards = 0
        rune_cards = 0
        battlefield_cards = 0
        sideboard_cards = 0
        domain_labels = []
        domain_set = set()
        off_domain_cards = []
        copy_counts_by_key = {}
        card_names_by_key = {}
        battlefield_name_counts = {}
        banned_cards = []
        banned_battlefields = []
        signature_cards = []
        legend_champion_tag = None
        chosen_champion_card = None
        chosen_champion_cards = 0

        chosen_champion_card_id = getattr(deck, "riftbound_chosen_champion_card_id", None) if deck else None

        for entry in deck_entries:
            card = entry["card"]
            quantity = entry["quantity"]
            storage_section = entry["storage_section"]
            riftbound_data = getattr(card, "riftbound_data", None)
            card_domains = self._get_card_colors(deck_tgc, card)
            if not card_domains and riftbound_data:
                card_domains = set(get_riftbound_domains(riftbound_data.domains))

            if storage_section == "legend":
                legend_cards += quantity
                if riftbound_data and riftbound_data.champion_tag:
                    legend_champion_tag = riftbound_data.champion_tag.strip().lower()
                if card_domains:
                    domain_labels = sorted(card_domains)
                    domain_set = set(domain_labels)
                if riftbound_data and (riftbound_data.legality_status or "").strip().lower().startswith("banned"):
                    banned_cards.append({"id": card.id, "name": card.name, "quantity": quantity})
                continue

            if storage_section == "rune":
                rune_cards += quantity
            elif storage_section == "battlefield":
                battlefield_cards += quantity
                battlefield_key = " ".join((card.name or f"CARD-{card.id}").strip().lower().split())
                battlefield_name_counts[battlefield_key] = battlefield_name_counts.get(battlefield_key, 0) + quantity
                if riftbound_data and (riftbound_data.legality_status or "").strip().lower().startswith("banned"):
                    banned_battlefields.append({"id": card.id, "name": card.name, "quantity": quantity})
            elif storage_section == "sideboard":
                sideboard_cards += quantity
            else:
                main_deck_cards += quantity

            if storage_section in {"main", "sideboard"}:
                copy_key = self._get_copy_limit_key(deck_tgc, card)
                copy_counts_by_key[copy_key] = copy_counts_by_key.get(copy_key, 0) + quantity
                card_names_by_key[copy_key] = card.name

            if chosen_champion_card_id and storage_section == "main" and card.id == chosen_champion_card_id and quantity > 0:
                chosen_champion_card = card
                chosen_champion_cards = 1

            if riftbound_data and riftbound_data.is_signature:
                signature_cards.append({"id": card.id, "name": card.name, "champion_tag": (riftbound_data.champion_tag or "").strip().lower()})

            if storage_section in {"main", "rune"} and domain_set and card_domains and not card_domains.issubset(domain_set):
                off_domain_cards.append(
                    {
                        "id": card.id,
                        "name": card.name,
                        "quantity": quantity,
                        "color": card.color or "",
                    }
                )

            if storage_section in {"main", "rune", "sideboard"} and riftbound_data and (riftbound_data.legality_status or "").strip().lower().startswith("banned"):
                banned_cards.append({"id": card.id, "name": card.name, "quantity": quantity})

        copy_limit_exceeded_cards = [
            {
                "source_card_id": copy_key,
                "name": card_names_by_key.get(copy_key) or copy_key,
                "quantity": quantity,
            }
            for copy_key, quantity in copy_counts_by_key.items()
            if quantity > rules["max_copies_per_card"]
        ]
        duplicated_battlefields = [
            {
                "name": next(
                    (
                        entry["card"].name
                        for entry in deck_entries
                        if entry["storage_section"] == "battlefield"
                        and " ".join((entry["card"].name or "").strip().lower().split()) == battlefield_key
                    ),
                    battlefield_key,
                ),
                "quantity": quantity,
            }
            for battlefield_key, quantity in battlefield_name_counts.items()
            if quantity > 1
        ]
        invalid_signature_cards = [
            card_info
            for card_info in signature_cards
            if not legend_champion_tag or card_info["champion_tag"] != legend_champion_tag
        ]
        chosen_champion_valid = bool(
            chosen_champion_card
            and chosen_champion_card.riftbound_data
            and chosen_champion_card.riftbound_data.is_champion
            and legend_champion_tag
            and (chosen_champion_card.riftbound_data.champion_tag or "").strip().lower() == legend_champion_tag
        )

        unique_battlefields = len(battlefield_name_counts)
        main_draw_pool_cards = max(main_deck_cards - chosen_champion_cards, 0)

        return {
            "format_mode": "riftbound",
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
            "egg_cards": 0,
            "required_egg_cards": 0,
            "max_egg_cards": 0,
            "missing_egg_cards": 0,
            "extra_egg_cards": 0,
            "leader_color_labels": [],
            "deck_color_labels": domain_labels,
            "max_deck_colors": 0,
            "off_color_cards": off_domain_cards,
            "copy_limit_exceeded_cards": copy_limit_exceeded_cards,
            "banned_cards": banned_cards,
            "banned_battlefields": banned_battlefields,
            "legend_cards": legend_cards,
            "required_legend_cards": rules["required_legend_cards"],
            "rune_cards": rune_cards,
            "required_rune_cards": rules["required_rune_cards"],
            "max_rune_cards": rules["max_rune_cards"],
            "battlefield_cards": battlefield_cards,
            "required_battlefield_cards": rules["required_battlefield_cards"],
            "max_battlefield_cards": rules["max_battlefield_cards"],
            "unique_battlefields": unique_battlefields,
            "duplicated_battlefields": duplicated_battlefields,
            "sideboard_cards": sideboard_cards,
            "max_sideboard_cards": rules["max_sideboard_cards"],
            "chosen_champion_cards": chosen_champion_cards,
            "required_chosen_champion_cards": rules["required_chosen_champion_cards"],
            "domain_labels": domain_labels,
            "main_draw_pool_cards": main_draw_pool_cards,
            "invalid_signature_cards": invalid_signature_cards,
            "chosen_champion_valid": chosen_champion_valid,
            "color_match_ready": bool(domain_labels),
            "is_color_valid": not off_domain_cards,
            "is_valid": (
                legend_cards == rules["required_legend_cards"]
                and main_deck_cards == rules["required_main_deck_cards"]
                and rune_cards == rules["required_rune_cards"]
                and battlefield_cards == rules["required_battlefield_cards"]
                and unique_battlefields == battlefield_cards
                and chosen_champion_cards == rules["required_chosen_champion_cards"]
                and chosen_champion_valid
                and sideboard_cards <= rules["max_sideboard_cards"]
                and not off_domain_cards
                and not copy_limit_exceeded_cards
                and not banned_cards
                and not banned_battlefields
                and not invalid_signature_cards
            ),
        }

    def _build_deck_composition(self, deck_tgc, rules: dict, deck_entries: List[dict], deck=None):
        if self._is_one_piece_tgc(deck_tgc):
            return self._build_one_piece_deck_composition(rules, deck_entries)
        if self._is_gundam_tgc(deck_tgc):
            return self._build_gundam_deck_composition(rules, deck_entries)
        if self._is_digimon_tgc(deck_tgc):
            return self._build_digimon_deck_composition(rules, deck_entries)
        if self._is_riftbound_tgc(deck_tgc):
            return self._build_riftbound_deck_composition(deck_tgc, deck, rules, deck_entries)
        return self._build_generic_deck_composition(rules, deck_entries)

    def _validate_generic_quantity_rules(self, deck_tgc, rules: dict, next_quantity: int, next_total: int, card: Card):
        card_limit = self._get_card_quantity_limit(deck_tgc, rules, card)
        if next_quantity > card_limit:
            raise ValueError(
                f"You can only have up to {card_limit} copies of this card in this deck"
            )

        if (
            not self._is_one_piece_tgc(deck_tgc)
            and not self._is_digimon_tgc(deck_tgc)
            and not self._is_riftbound_tgc(deck_tgc)
            and next_total > rules["deck_max_cards"]
        ):
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

    def _validate_riftbound_composition(self, rules: dict, composition: dict, require_complete: bool):
        if composition["legend_cards"] > rules["required_legend_cards"]:
            raise ValueError("Riftbound solo permite 1 Legend por mazo.")
        if composition["main_deck_cards"] > rules["max_main_deck_cards"]:
            raise ValueError("El Main Deck de Riftbound debe quedarse en 40 cartas.")
        if composition["rune_cards"] > rules["max_rune_cards"]:
            raise ValueError("El Rune Deck de Riftbound debe quedarse en 12 cartas.")
        if composition["battlefield_cards"] > rules["max_battlefield_cards"]:
            raise ValueError("Riftbound solo permite 3 Battlefields.")
        if composition["sideboard_cards"] > rules["max_sideboard_cards"]:
            raise ValueError("El sideboard de Riftbound no puede superar 8 cartas.")
        if composition["duplicated_battlefields"]:
            duplicated = composition["duplicated_battlefields"][0]
            raise ValueError(f"Los Battlefields de Riftbound deben tener nombre unico. Revisa {duplicated['name']}.")
        if composition["copy_limit_exceeded_cards"]:
            exceeded_card = composition["copy_limit_exceeded_cards"][0]
            raise ValueError(
                f"En Riftbound solo puedes llevar hasta 3 copias de {exceeded_card['name']} contando main y sideboard."
            )
        if composition["off_color_cards"]:
            invalid_card = composition["off_color_cards"][0]
            allowed_domains = " / ".join(composition.get("domain_labels") or [])
            raise ValueError(
                f"{invalid_card['name']} no encaja en los domains de la Legend ({allowed_domains or 'sin detectar'})."
            )
        if composition["banned_cards"]:
            banned_card = composition["banned_cards"][0]
            raise ValueError(f"{banned_card['name']} esta baneada en Standard de Riftbound.")
        if composition["banned_battlefields"]:
            banned_battlefield = composition["banned_battlefields"][0]
            raise ValueError(f"{banned_battlefield['name']} esta baneado como Battlefield en Standard de Riftbound.")
        if composition["invalid_signature_cards"]:
            invalid_signature = composition["invalid_signature_cards"][0]
            raise ValueError(f"{invalid_signature['name']} es Signature y no coincide con la Legend elegida.")
        if composition["chosen_champion_cards"] > 0 and not composition["chosen_champion_valid"]:
            raise ValueError("El Chosen Champion debe ser un Champion del mismo personaje que tu Legend.")

        if require_complete:
            if composition["legend_cards"] != rules["required_legend_cards"]:
                raise ValueError("Un mazo de Riftbound necesita exactamente 1 Legend.")
            if composition["main_deck_cards"] != rules["required_main_deck_cards"]:
                raise ValueError("El Main Deck de Riftbound debe tener exactamente 40 cartas.")
            if composition["rune_cards"] != rules["required_rune_cards"]:
                raise ValueError("El Rune Deck de Riftbound debe tener exactamente 12 runes.")
            if composition["battlefield_cards"] != rules["required_battlefield_cards"]:
                raise ValueError("Un mazo de Riftbound necesita exactamente 3 Battlefields.")
            if composition["chosen_champion_cards"] != rules["required_chosen_champion_cards"] or not composition["chosen_champion_valid"]:
                raise ValueError("Un mazo de Riftbound necesita exactamente 1 Chosen Champion valido.")

    def _validate_deck_composition(self, deck_tgc, rules: dict, deck_entries: List[dict], card: Card, is_increase: bool = False, require_complete: bool = False, deck=None):
        composition = self._build_deck_composition(deck_tgc, rules, deck_entries, deck=deck)

        if self._is_one_piece_tgc(deck_tgc):
            self._validate_one_piece_composition(rules, composition, card, is_increase, require_complete)
        elif self._is_gundam_tgc(deck_tgc):
            self._validate_gundam_composition(rules, composition, require_complete)
        elif self._is_digimon_tgc(deck_tgc):
            self._validate_digimon_composition(rules, composition, require_complete)
        elif self._is_riftbound_tgc(deck_tgc):
            self._validate_riftbound_composition(rules, composition, require_complete)

        return composition
