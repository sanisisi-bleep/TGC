import re

GUNDAM_TGC_NAME = "Gundam TGC"
ONE_PIECE_TCG_NAME = "One Piece TCG"
MAGIC_TCG_NAME = "Magic: The Gathering"

ONE_PIECE_COLORS = ("Red", "Green", "Blue", "Purple", "Black", "Yellow")

DEFAULT_RULES = {
    "deck_min_cards": 0,
    "deck_max_cards": 999,
    "max_copies_per_card": 999,
    "required_leader_cards": 0,
    "required_main_deck_cards": 0,
    "max_main_deck_cards": 999,
    "max_don_cards": 0,
    "allow_optional_don_deck": False,
    "enforce_color_identity": False,
}


TGC_RULES = {
    GUNDAM_TGC_NAME: {
        "deck_min_cards": 50,
        "deck_max_cards": 50,
        "max_copies_per_card": 4,
        "required_leader_cards": 0,
        "required_main_deck_cards": 50,
        "max_main_deck_cards": 50,
        "max_don_cards": 0,
        "allow_optional_don_deck": False,
        "enforce_color_identity": False,
    },
    ONE_PIECE_TCG_NAME: {
        "deck_min_cards": 50,
        "deck_max_cards": 50,
        "max_copies_per_card": 4,
        "required_leader_cards": 1,
        "required_main_deck_cards": 50,
        "max_main_deck_cards": 50,
        "max_don_cards": 10,
        "allow_optional_don_deck": True,
        "enforce_color_identity": True,
    },
    MAGIC_TCG_NAME: {
        "deck_min_cards": 60,
        "deck_max_cards": 999,
        "max_copies_per_card": 4,
        "required_leader_cards": 0,
        "required_main_deck_cards": 60,
        "max_main_deck_cards": 999,
        "max_don_cards": 0,
        "allow_optional_don_deck": False,
        "enforce_color_identity": False,
    },
}


def get_tcg_rules(tgc_name: str | None):
    if not tgc_name:
        return DEFAULT_RULES
    return TGC_RULES.get(tgc_name, DEFAULT_RULES)


def normalize_card_type(card_type: str | None):
    return (card_type or "").strip().upper()


def get_one_piece_card_role(card_type: str | None):
    normalized = normalize_card_type(card_type)
    if "DON" in normalized:
        return "don"
    if normalized == "LEADER":
        return "leader"
    return "main"


def get_one_piece_colors(raw_color: str | None):
    normalized = (raw_color or "").strip()
    if not normalized:
        return []

    detected_colors = []
    for color in ONE_PIECE_COLORS:
        if re.search(rf"\b{re.escape(color)}\b", normalized, flags=re.IGNORECASE):
            detected_colors.append(color)
    return detected_colors
