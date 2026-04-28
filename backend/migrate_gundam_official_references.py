import os
import re
from collections import defaultdict

from app.env import load_environment
from app.models import Card, DeckCard, DeckConsideringCard, DeckEggCard, GundamCard, Tgc, UserCollection
from app.services.game_rules import GUNDAM_TGC_NAME

load_environment()

# Migration settings
# Dry-run por defecto para no tocar referencias sin querer.
DEFAULT_DATABASE_TARGET = "PRO"
DEFAULT_APPLY_CHANGES = False
DEFAULT_VERBOSE = True
DEFAULT_ALLOW_CROSS_VERSION_MATCH = False
DEFAULT_PRUNE_LEGACY = True

OFFICIAL_GUNDAM_SET_OPTIONS = [
    {"label": "Newtype Rising [GD01]", "set_code": "GD01"},
    {"label": "Dual Impact [GD02]", "set_code": "GD02"},
    {"label": "Steel Requiem [GD03]", "set_code": "GD03"},
    {"label": "Phantom Aria [GD04]", "set_code": "GD04"},
    {"label": "Heroic Beginnings [ST01]", "set_code": "ST01"},
    {"label": "Wings of Advance [ST02]", "set_code": "ST02"},
    {"label": "Zeon's Rush [ST03]", "set_code": "ST03"},
    {"label": "SEED Strike [ST04]", "set_code": "ST04"},
    {"label": "Iron Bloom [ST05]", "set_code": "ST05"},
    {"label": "Clan Unity [ST06]", "set_code": "ST06"},
    {"label": "Celestial Drive [ST07]", "set_code": "ST07"},
    {"label": "Flash of Radiance [ST08]", "set_code": "ST08"},
    {"label": "Destiny Ignition [ST09]", "set_code": "ST09"},
    {"label": "Other Product Card", "set_code": "OTHER-PRODUCT"},
    {"label": "Edition Beta", "set_code": "BETA"},
    {"label": "Basic Cards", "set_code": "BASIC"},
    {"label": "Promotion card", "set_code": "PROMOTION"},
]

OFFICIAL_SET_NAMES = {item["label"] for item in OFFICIAL_GUNDAM_SET_OPTIONS}
OFFICIAL_SET_CODES = {item["set_code"] for item in OFFICIAL_GUNDAM_SET_OPTIONS}


def resolve_populate_database_target():
    raw_target = os.getenv("POPULATE_DATABASE_TARGET", DEFAULT_DATABASE_TARGET)
    normalized = raw_target.strip().strip('"').upper()
    return normalized or DEFAULT_DATABASE_TARGET


def resolve_optional_bool(name, default=False):
    raw_value = os.getenv(name, "")
    if not raw_value:
        return default
    return raw_value.strip().strip('"').lower() in {"1", "true", "yes", "on"}


POPULATE_DATABASE_TARGET = resolve_populate_database_target()
os.environ["DATABASE_TARGET"] = POPULATE_DATABASE_TARGET

from app.database.connection import SessionLocal, init_db  # noqa: E402


APPLY_CHANGES = resolve_optional_bool("GUNDAM_MIGRATION_APPLY", default=DEFAULT_APPLY_CHANGES)
POPULATE_VERBOSE = resolve_optional_bool("POPULATE_VERBOSE", default=DEFAULT_VERBOSE)
ALLOW_CROSS_VERSION_MATCH = resolve_optional_bool(
    "GUNDAM_MIGRATION_ALLOW_CROSS_VERSION",
    default=DEFAULT_ALLOW_CROSS_VERSION_MATCH,
)
PRUNE_LEGACY = resolve_optional_bool("GUNDAM_MIGRATION_PRUNE_LEGACY", default=DEFAULT_PRUNE_LEGACY)


def clean_text(value):
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def normalize_token(value):
    return clean_text(value).upper()


def normalize_source_card_id(value):
    normalized = normalize_token(value).replace("_", "-")
    normalized = re.sub(r"\s+", "", normalized)
    normalized = re.sub(r"-{2,}", "-", normalized)
    return normalized


def normalize_label(value):
    return re.sub(r"\s+", " ", clean_text(value)).lower()


def is_variant_code(code):
    return bool(re.search(r"-P\d+$", normalize_source_card_id(code), flags=re.IGNORECASE))


def has_value(value):
    return value is not None and clean_text(value) != ""


def merge_assigned_quantity(existing_value, incoming_value, total_quantity):
    if existing_value is None and incoming_value is None:
        return None

    normalized_values = [max(0, int(value)) for value in (existing_value, incoming_value) if value is not None]
    if not normalized_values:
        return None

    return min(total_quantity, sum(normalized_values))


def build_row_key(row, *field_names):
    return tuple(getattr(row, field_name) for field_name in field_names)


def is_official_like_card(card, detail):
    if detail and has_value(detail.qa):
        return True
    if detail and has_value(detail.source_title):
        return True
    if detail and has_value(detail.get_it):
        return True
    if clean_text(card.set_name) in OFFICIAL_SET_NAMES:
        return True
    if normalize_token(card.version) in OFFICIAL_SET_CODES:
        return True
    if has_value(card.description) and "Where to get it:" in card.description:
        return True
    return False


def score_gundam_card(card, detail):
    score = 0

    if detail and has_value(detail.qa):
        score += 500
    if detail and has_value(detail.get_it):
        score += 120
    if detail and has_value(detail.source_title):
        score += 120
    if clean_text(card.set_name) in OFFICIAL_SET_NAMES:
        score += 120
    if normalize_token(card.version) in OFFICIAL_SET_CODES:
        score += 60
    if has_value(card.description) and "Where to get it:" in card.description:
        score += 40
    if has_value(card.image_url) and "gundam-gcg.com" in card.image_url:
        score += 20

    for value in (
        card.name,
        card.card_type,
        card.color,
        card.rarity,
        card.set_name,
        card.version,
        card.traits,
        card.link,
        card.zones,
        card.artist,
        card.abilities,
        card.description,
        card.image_url,
    ):
        if has_value(value):
            score += len(clean_text(value))

    for value in (card.lv, card.cost, card.ap, card.hp, card.block):
        if value is not None:
            score += 5

    return score


def is_significantly_better(current_card, current_detail, candidate_card, candidate_detail):
    current_score = score_gundam_card(current_card, current_detail)
    candidate_score = score_gundam_card(candidate_card, candidate_detail)

    if candidate_score <= current_score:
        return False

    if has_value(candidate_detail.qa if candidate_detail else "") and not has_value(current_detail.qa if current_detail else ""):
        return True

    return candidate_score >= current_score + 25


def choose_best_candidate(candidates, detail_by_card_id):
    if not candidates:
        return None

    non_variant_candidates = [
        card for card in candidates
        if not is_variant_code(card.source_card_id)
    ]
    if non_variant_candidates:
        candidates = non_variant_candidates

    return max(
        candidates,
        key=lambda card: (score_gundam_card(card, detail_by_card_id.get(card.id)), -card.id),
    )


def build_indexes(cards):
    indexes = {
        "by_source_version": defaultdict(list),
        "by_source_set": defaultdict(list),
        "by_deck_version": defaultdict(list),
        "by_deck_set": defaultdict(list),
        "by_name_version": defaultdict(list),
        "by_source": defaultdict(list),
    }

    for card in cards:
        source_key = normalize_source_card_id(card.source_card_id)
        deck_key = normalize_source_card_id(card.deck_key or card.source_card_id)
        version_key = normalize_token(card.version)
        set_key = normalize_label(card.set_name)
        name_key = normalize_token(card.name)

        indexes["by_source_version"][(source_key, version_key)].append(card)
        indexes["by_source_set"][(source_key, set_key)].append(card)
        indexes["by_deck_version"][(deck_key, version_key)].append(card)
        indexes["by_deck_set"][(deck_key, set_key)].append(card)
        indexes["by_name_version"][(name_key, version_key)].append(card)
        indexes["by_source"][source_key].append(card)

    return indexes


def filter_other_cards(cards, current_card):
    return [card for card in cards if card.id != current_card.id]


def find_target_card(current_card, detail_by_card_id, indexes):
    current_detail = detail_by_card_id.get(current_card.id)
    source_key = normalize_source_card_id(current_card.source_card_id)
    deck_key = normalize_source_card_id(current_card.deck_key or current_card.source_card_id)
    version_key = normalize_token(current_card.version)
    set_key = normalize_label(current_card.set_name)
    name_key = normalize_token(current_card.name)

    candidate_groups = [
        ("source+version", filter_other_cards(indexes["by_source_version"][(source_key, version_key)], current_card)),
        ("source+set", filter_other_cards(indexes["by_source_set"][(source_key, set_key)], current_card)),
    ]

    if not is_variant_code(source_key):
        candidate_groups.extend(
            [
                ("deck_key+version", filter_other_cards(indexes["by_deck_version"][(deck_key, version_key)], current_card)),
                ("deck_key+set", filter_other_cards(indexes["by_deck_set"][(deck_key, set_key)], current_card)),
                ("name+version", filter_other_cards(indexes["by_name_version"][(name_key, version_key)], current_card)),
            ]
        )

    if ALLOW_CROSS_VERSION_MATCH:
        candidate_groups.append(("source", filter_other_cards(indexes["by_source"][source_key], current_card)))

    for match_type, candidates in candidate_groups:
        if match_type == "name+version":
            unique_deck_keys = {
                normalize_source_card_id(candidate.deck_key or candidate.source_card_id)
                for candidate in candidates
            }
            if len(unique_deck_keys) != 1:
                continue

        target_card = choose_best_candidate(candidates, detail_by_card_id)
        if not target_card:
            continue

        target_detail = detail_by_card_id.get(target_card.id)
        if not is_significantly_better(current_card, current_detail, target_card, target_detail):
            continue

        return target_card, match_type

    return None, None


def get_gundam_tgc(db):
    return db.query(Tgc).filter(Tgc.name == GUNDAM_TGC_NAME).first()


def build_reference_mapping(db, gundam_tgc_id):
    gundam_cards = db.query(Card).filter(Card.tgc_id == gundam_tgc_id).all()
    detail_by_card_id = {
        detail.card_id: detail
        for detail in db.query(GundamCard)
        .join(Card, Card.id == GundamCard.card_id)
        .filter(Card.tgc_id == gundam_tgc_id)
        .all()
    }

    official_like_count = sum(
        1 for card in gundam_cards
        if has_value(getattr(detail_by_card_id.get(card.id), "qa", ""))
    )
    if official_like_count == 0:
        raise ValueError(
            "No official-like Gundam cards with Q&A were found in the database. "
            "Run backend/populate_gundam_official.py first."
        )

    indexes = build_indexes(gundam_cards)
    remap_plan = {}
    match_type_counts = defaultdict(int)

    for card in gundam_cards:
        current_detail = detail_by_card_id.get(card.id)
        if is_official_like_card(card, current_detail):
            continue

        target_card, match_type = find_target_card(card, detail_by_card_id, indexes)
        if not target_card:
            continue
        remap_plan[card.id] = {
            "from_card": card,
            "to_card": target_card,
            "match_type": match_type,
        }
        match_type_counts[match_type] += 1

    return remap_plan, match_type_counts


def apply_collection_remap(db, remap_plan):
    target_card_ids = {entry["to_card"].id for entry in remap_plan.values()}
    rows = (
        db.query(UserCollection)
        .filter(UserCollection.card_id.in_(set(remap_plan.keys()) | target_card_ids))
        .all()
    )

    moved = 0
    merged = 0
    keeper_by_key = {}

    for row in rows:
        key = build_row_key(row, "user_id", "card_id")
        if row.card_id in target_card_ids:
            keeper_by_key[key] = row

    for row in rows:
        if row.card_id not in remap_plan:
            continue

        target_card_id = remap_plan[row.card_id]["to_card"].id
        if target_card_id == row.card_id:
            continue

        target_key = (row.user_id, target_card_id)
        existing = keeper_by_key.get(target_key)

        if existing:
            existing.quantity += row.quantity
            db.delete(row)
            merged += 1
        else:
            old_key = build_row_key(row, "user_id", "card_id")
            row.card_id = target_card_id
            keeper_by_key.pop(old_key, None)
            keeper_by_key[target_key] = row
            moved += 1

    return {"moved": moved, "merged": merged}


def apply_deck_remap(db, remap_plan, model_class):
    target_card_ids = {entry["to_card"].id for entry in remap_plan.values()}
    rows = (
        db.query(model_class)
        .filter(model_class.card_id.in_(set(remap_plan.keys()) | target_card_ids))
        .all()
    )

    moved = 0
    merged = 0
    keeper_by_key = {}

    for row in rows:
        key = build_row_key(row, "deck_id", "card_id")
        if row.card_id in target_card_ids:
            keeper_by_key[key] = row

    for row in rows:
        if row.card_id not in remap_plan:
            continue

        target_card_id = remap_plan[row.card_id]["to_card"].id
        if target_card_id == row.card_id:
            continue

        target_key = (row.deck_id, target_card_id)
        existing = keeper_by_key.get(target_key)

        if existing:
            new_total_quantity = existing.quantity + row.quantity
            existing.quantity = new_total_quantity
            if hasattr(existing, "assigned_quantity"):
                existing.assigned_quantity = merge_assigned_quantity(
                    existing.assigned_quantity,
                    row.assigned_quantity,
                    new_total_quantity,
                )
            db.delete(row)
            merged += 1
        else:
            old_key = build_row_key(row, "deck_id", "card_id")
            row.card_id = target_card_id
            keeper_by_key.pop(old_key, None)
            keeper_by_key[target_key] = row
            moved += 1

    return {"moved": moved, "merged": merged}


def apply_considering_remap(db, remap_plan):
    target_card_ids = {entry["to_card"].id for entry in remap_plan.values()}
    rows = (
        db.query(DeckConsideringCard)
        .filter(DeckConsideringCard.card_id.in_(set(remap_plan.keys()) | target_card_ids))
        .all()
    )

    moved = 0
    merged = 0
    keeper_by_key = {}

    for row in rows:
        key = build_row_key(row, "deck_id", "card_id")
        if row.card_id in target_card_ids:
            keeper_by_key[key] = row

    for row in rows:
        if row.card_id not in remap_plan:
            continue

        target_card_id = remap_plan[row.card_id]["to_card"].id
        if target_card_id == row.card_id:
            continue

        target_key = (row.deck_id, target_card_id)
        existing = keeper_by_key.get(target_key)

        if existing:
            existing.quantity += row.quantity
            db.delete(row)
            merged += 1
        else:
            old_key = build_row_key(row, "deck_id", "card_id")
            row.card_id = target_card_id
            keeper_by_key.pop(old_key, None)
            keeper_by_key[target_key] = row
            moved += 1

    return {"moved": moved, "merged": merged}


def collect_referenced_card_ids(db):
    referenced_ids = set()

    referenced_ids.update(card_id for (card_id,) in db.query(UserCollection.card_id).distinct().all())
    referenced_ids.update(card_id for (card_id,) in db.query(DeckCard.card_id).distinct().all())
    referenced_ids.update(card_id for (card_id,) in db.query(DeckEggCard.card_id).distinct().all())
    referenced_ids.update(card_id for (card_id,) in db.query(DeckConsideringCard.card_id).distinct().all())

    return referenced_ids


def prune_legacy_cards(db, remap_plan):
    legacy_card_ids = set(remap_plan.keys())
    referenced_ids = collect_referenced_card_ids(db)
    deletable_ids = [card_id for card_id in legacy_card_ids if card_id not in referenced_ids]

    if deletable_ids:
        db.query(GundamCard).filter(GundamCard.card_id.in_(deletable_ids)).delete(synchronize_session=False)
        db.query(Card).filter(Card.id.in_(deletable_ids)).delete(synchronize_session=False)

    return {
        "deleted_cards": len(deletable_ids),
    }


def main():
    init_db()
    db = SessionLocal()

    try:
        print(f"Database target: {POPULATE_DATABASE_TARGET}")
        print(f"Apply changes: {APPLY_CHANGES}")
        print(f"Allow cross-version match: {ALLOW_CROSS_VERSION_MATCH}")
        print(f"Prune legacy after remap: {PRUNE_LEGACY}")

        gundam_tgc = get_gundam_tgc(db)
        if not gundam_tgc:
            raise ValueError("Gundam TGC was not found in the database.")

        remap_plan, match_type_counts = build_reference_mapping(db, gundam_tgc.id)

        print("")
        print("Migration plan")
        print(f"- Candidate legacy cards to realign: {len(remap_plan)}")
        for match_type in sorted(match_type_counts):
            print(f"- {match_type}: {match_type_counts[match_type]}")

        if POPULATE_VERBOSE and remap_plan:
            print("- Sample remaps:")
            for entry in list(remap_plan.values())[:20]:
                from_card = entry["from_card"]
                to_card = entry["to_card"]
                print(
                    f"  {from_card.id}:{from_card.source_card_id} [{from_card.version}] -> "
                    f"{to_card.id}:{to_card.source_card_id} [{to_card.version}] ({entry['match_type']})"
                )

        collection_result = apply_collection_remap(db, remap_plan)
        deck_result = apply_deck_remap(db, remap_plan, DeckCard)
        egg_result = apply_deck_remap(db, remap_plan, DeckEggCard)
        considering_result = apply_considering_remap(db, remap_plan)

        db.flush()

        prune_result = {"deleted_cards": 0}
        if PRUNE_LEGACY:
            prune_result = prune_legacy_cards(db, remap_plan)

        if APPLY_CHANGES:
            db.commit()
        else:
            db.rollback()

        print("")
        print("Migration summary")
        print(f"- Mode: {'apply' if APPLY_CHANGES else 'dry-run'}")
        print(f"- Collection rows moved: {collection_result['moved']}")
        print(f"- Collection rows merged: {collection_result['merged']}")
        print(f"- Deck rows moved: {deck_result['moved']}")
        print(f"- Deck rows merged: {deck_result['merged']}")
        print(f"- Egg rows moved: {egg_result['moved']}")
        print(f"- Egg rows merged: {egg_result['merged']}")
        print(f"- Considering rows moved: {considering_result['moved']}")
        print(f"- Considering rows merged: {considering_result['merged']}")
        print(f"- Legacy cards removable after remap: {prune_result['deleted_cards']}")

        if not APPLY_CHANGES:
            print("")
            print("Dry-run only. To apply the migration:")
            print('$env:GUNDAM_MIGRATION_APPLY="true"')
            print(r'.venv\Scripts\python.exe backend\migrate_gundam_official_references.py')
    finally:
        db.close()


if __name__ == "__main__":
    main()
