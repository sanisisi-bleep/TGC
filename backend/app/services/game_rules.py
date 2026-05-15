import re

GUNDAM_TCG_NAME = "Gundam Card Game"
ONE_PIECE_TCG_NAME = "One Piece Card Game"
MAGIC_TCG_NAME = "Magic: The Gathering"
DIGIMON_TCG_NAME = "Digimon Card Game"
RIFTBOUND_TCG_NAME = "Riftbound"

TGC_NAME_ALIASES = {
    GUNDAM_TCG_NAME: {
        "gundam",
        "gundam card game",
        "gundam cg",
        "gundam gcg",
        "gundam tcg",
    },
    ONE_PIECE_TCG_NAME: {
        "one piece",
        "one piece card game",
        "one piece tcg",
    },
    DIGIMON_TCG_NAME: {
        "digimon",
        "digimon card game",
        "digimon tcg",
    },
    MAGIC_TCG_NAME: {
        "magic: the gathering",
        "magic the gathering",
        "magic",
    },
    RIFTBOUND_TCG_NAME: {
        "riftbound",
        "riftbound tcg",
    },
}

GUNDAM_COLORS = ("Blue", "Green", "Red", "Purple", "White")
ONE_PIECE_COLORS = ("Red", "Green", "Blue", "Purple", "Black", "Yellow")
DIGIMON_COLORS = ("Red", "Blue", "Yellow", "Green", "White", "Black", "Purple")
RIFTBOUND_DOMAINS = (
    "Calm",
    "Chaos",
    "Body",
    "Mind",
    "Spirit",
    "Order",
    "Fury",
)

DEFAULT_RULES = {
    "deck_min_cards": 0,
    "deck_max_cards": 999,
    "max_copies_per_card": 999,
    "max_resource_copies_per_card": 999,
    "required_leader_cards": 0,
    "required_main_deck_cards": 0,
    "max_main_deck_cards": 999,
    "required_resource_cards": 0,
    "max_resource_cards": 0,
    "allow_optional_resource_deck": False,
    "max_don_cards": 0,
    "allow_optional_don_deck": False,
    "enforce_color_identity": False,
    "max_deck_colors": 0,
    "required_egg_cards": 0,
    "max_egg_cards": 0,
    "required_legend_cards": 0,
    "required_rune_cards": 0,
    "max_rune_cards": 0,
    "required_battlefield_cards": 0,
    "max_battlefield_cards": 0,
    "required_chosen_champion_cards": 0,
    "max_sideboard_cards": 0,
    "supports_ex_base_token": False,
    "supports_ex_resource_token": False,
    "max_ex_resource_tokens": 0,
}


TGC_RULES = {
    GUNDAM_TCG_NAME: {
        "deck_min_cards": 50,
        "deck_max_cards": 50,
        "max_copies_per_card": 4,
        "required_leader_cards": 0,
        "required_main_deck_cards": 50,
        "max_main_deck_cards": 50,
        "required_resource_cards": 10,
        "max_resource_cards": 10,
        "allow_optional_resource_deck": True,
        "max_resource_copies_per_card": 999,
        "max_don_cards": 0,
        "allow_optional_don_deck": False,
        "enforce_color_identity": True,
        "max_deck_colors": 2,
        "supports_ex_base_token": True,
        "supports_ex_resource_token": True,
        "max_ex_resource_tokens": 5,
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
    RIFTBOUND_TCG_NAME: {
        "deck_min_cards": 56,
        "deck_max_cards": 64,
        "max_copies_per_card": 3,
        "required_leader_cards": 0,
        "required_main_deck_cards": 40,
        "max_main_deck_cards": 40,
        "max_don_cards": 0,
        "allow_optional_don_deck": False,
        "enforce_color_identity": True,
        "max_deck_colors": 0,
        "required_egg_cards": 0,
        "max_egg_cards": 0,
        "required_legend_cards": 1,
        "required_rune_cards": 12,
        "max_rune_cards": 12,
        "required_battlefield_cards": 3,
        "max_battlefield_cards": 3,
        "required_chosen_champion_cards": 1,
        "max_sideboard_cards": 8,
    },
}


def normalize_tgc_name(value: str | None):
    normalized = re.sub(r"[_-]+", " ", (value or "").strip())
    return re.sub(r"\s+", " ", normalized).lower()


def compact_tgc_name(value: str | None):
    return re.sub(r"[^a-z0-9]+", "", normalize_tgc_name(value))


def canonicalize_tgc_name(value: str | None):
    normalized = normalize_tgc_name(value)
    if not normalized:
        return None

    compact_normalized = compact_tgc_name(normalized)

    for canonical_name, aliases in TGC_NAME_ALIASES.items():
        if normalized in aliases:
            return canonical_name
        if compact_normalized and compact_tgc_name(canonical_name) == compact_normalized:
            return canonical_name
        for alias in aliases:
            if compact_normalized and compact_tgc_name(alias) == compact_normalized:
                return canonical_name

    if "gundam" in compact_normalized:
        return GUNDAM_TCG_NAME
    if "onepiece" in compact_normalized:
        return ONE_PIECE_TCG_NAME
    if "digimon" in compact_normalized:
        return DIGIMON_TCG_NAME
    if "riftbound" in compact_normalized:
        return RIFTBOUND_TCG_NAME
    if "magic" in compact_normalized:
        return MAGIC_TCG_NAME

    return re.sub(r"\s+", " ", (value or "").strip()) or None


def get_tgc_name_aliases(value: str | None):
    canonical_name = canonicalize_tgc_name(value)
    if not canonical_name:
        return ()

    aliases = TGC_NAME_ALIASES.get(canonical_name)
    if not aliases:
        return (canonical_name,)

    ordered_aliases = [canonical_name]
    for alias in sorted(aliases):
        pretty_alias = re.sub(r"\s+", " ", alias).strip()
        if pretty_alias.lower() == canonical_name.lower():
            continue
        if pretty_alias not in ordered_aliases:
            ordered_aliases.append(pretty_alias)

    return tuple(ordered_aliases)


def is_tgc_name(value: str | None, expected_name: str | None):
    return canonicalize_tgc_name(value) == canonicalize_tgc_name(expected_name)


def get_tcg_rules(tgc_name: str | None):
    canonical_name = canonicalize_tgc_name(tgc_name)
    if not canonical_name:
        return DEFAULT_RULES
    return TGC_RULES.get(canonical_name, DEFAULT_RULES)


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


def get_gundam_card_role(card_type: str | None, card_zones: str | None = None, detail_zone: str | None = None):
    normalized_card_type = normalize_card_type(card_type)
    if "RESOURCE" in normalized_card_type:
        return "resource"

    normalized_zones = " ".join(
        part.strip().lower()
        for part in (card_zones, detail_zone)
        if isinstance(part, str) and part.strip()
    )
    if normalized_zones and re.search(r"\bresource\b", normalized_zones, flags=re.IGNORECASE):
        return "resource"

    return "main"


def get_one_piece_colors(raw_color: str | None):
    return detect_colors(raw_color, ONE_PIECE_COLORS)


def get_digimon_card_role(card_type: str | None):
    normalized = normalize_card_type(card_type)
    if normalized in {"DIGI-EGG", "DIGIEGG"}:
        return "egg"
    return "main"


def get_digimon_colors(raw_color: str | None):
    return detect_colors(raw_color, DIGIMON_COLORS)


def get_riftbound_domains(raw_color: str | None):
    return detect_colors(raw_color, RIFTBOUND_DOMAINS)
