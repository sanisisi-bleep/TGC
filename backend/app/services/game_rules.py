GUNDAM_TGC_NAME = "Gundam TGC"
ONE_PIECE_TCG_NAME = "One Piece TCG"
MAGIC_TCG_NAME = "Magic: The Gathering"


DEFAULT_RULES = {
    "deck_min_cards": 0,
    "deck_max_cards": 999,
    "max_copies_per_card": 999,
}


TGC_RULES = {
    GUNDAM_TGC_NAME: {
        "deck_min_cards": 50,
        "deck_max_cards": 50,
        "max_copies_per_card": 4,
    },
    ONE_PIECE_TCG_NAME: {
        "deck_min_cards": 50,
        "deck_max_cards": 50,
        "max_copies_per_card": 4,
    },
    MAGIC_TCG_NAME: {
        "deck_min_cards": 60,
        "deck_max_cards": 999,
        "max_copies_per_card": 4,
    },
}


def get_tcg_rules(tgc_name: str | None):
    if not tgc_name:
        return DEFAULT_RULES
    return TGC_RULES.get(tgc_name, DEFAULT_RULES)
