import re

GUNDAM_TGC_NAME = "Gundam TGC"
ONE_PIECE_TCG_NAME = "One Piece TCG"
MAGIC_TCG_NAME = "Magic: The Gathering"
DIGIMON_TCG_NAME = "Digimon Card Game"

GUNDAM_COLORS = ("Blue", "Green", "Red", "Purple", "White")
ONE_PIECE_COLORS = ("Red", "Green", "Blue", "Purple", "Black", "Yellow")
DIGIMON_COLORS = ("Red", "Blue", "Yellow", "Green", "White", "Black", "Purple")

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
    "max_deck_colors": 0,
    "required_egg_cards": 0,
    "max_egg_cards": 0,
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
        "enforce_color_identity": True,
        "max_deck_colors": 2,
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
        "max_deck_colors": 0,
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
        "max_deck_colors": 0,
        "required_egg_cards": 0,
        "max_egg_cards": 0,
    },
    DIGIMON_TCG_NAME: {
        "deck_min_cards": 50,
        "deck_max_cards": 55,
        "max_copies_per_card": 4,
        "required_leader_cards": 0,
        "required_main_deck_cards": 50,
        "max_main_deck_cards": 50,
        "max_don_cards": 0,
        "allow_optional_don_deck": False,
        "enforce_color_identity": False,
        "max_deck_colors": 0,
        "required_egg_cards": 0,
        "max_egg_cards": 5,
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


def detect_colors(raw_color: str | None, known_colors: tuple[str, ...]):
    normalized = (raw_color or "").strip()
    if not normalized:
        return []

    detected_colors = []
    for color in known_colors:
        if re.search(rf"\b{re.escape(color)}\b", normalized, flags=re.IGNORECASE):
            detected_colors.append(color)
    return detected_colors


def get_gundam_colors(raw_color: str | None):
    return detect_colors(raw_color, GUNDAM_COLORS)


def get_one_piece_colors(raw_color: str | None):
    return detect_colors(raw_color, ONE_PIECE_COLORS)


def get_digimon_card_role(card_type: str | None):
    normalized = normalize_card_type(card_type)
    if normalized in {"DIGI-EGG", "DIGIEGG"}:
        return "egg"
    return "main"


def get_digimon_colors(raw_color: str | None):
    return detect_colors(raw_color, DIGIMON_COLORS)
