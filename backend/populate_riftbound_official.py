import json
import os
import re
import time
from html import unescape

import requests
from bs4 import BeautifulSoup

from app.env import load_environment
from app.models import (
    Card,
    Deck,
    DeckCard,
    DeckConsideringCard,
    DeckEggCard,
    DeckZoneCard,
    RiftboundCard,
    Tgc,
    UserCollection,
)
from app.services.game_rules import RIFTBOUND_TCG_NAME, get_tgc_name_aliases

load_environment()

DEFAULT_DATABASE_TARGET = "PRO"
DEFAULT_MAX_RETRIES = 2
DEFAULT_REQUEST_TIMEOUT = 30
DEFAULT_FETCH_ONLY = False
DEFAULT_VERBOSE = False
DEFAULT_PRUNE_STALE_MODE = "auto"
DEFAULT_RIFTBOUND_CARD_GALLERY_URL = "https://riftbound.leagueoflegends.com/en-us/tcg-cards/"
DEFAULT_RIFTBOUND_BANS_URL = "https://riftbound.leagueoflegends.com/en-us/news/announcements/announcing-riftbounds-first-bans/"
DEFAULT_SET_CODE_FILTER = ""

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/147.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

RIFTBOUND_STRING_LIMITS = {
    "source_card_id": 50,
    "deck_key": 50,
    "name": 255,
    "card_type": 50,
    "color": 100,
    "rarity": 20,
    "set_name": 255,
    "version": 50,
}

RIFTBOUND_DETAIL_STRING_LIMITS = {
    "champion_tag": 100,
    "variant_code": 50,
    "set_code": 50,
    "legality_status": 50,
}

RIFTBOUND_KNOWN_DOMAINS = {
    "calm",
    "chaos",
    "body",
    "mind",
    "spirit",
    "order",
    "fury",
}


def resolve_populate_database_target():
    raw_target = os.getenv("POPULATE_DATABASE_TARGET", DEFAULT_DATABASE_TARGET)
    normalized = raw_target.strip().strip('"').upper()
    return normalized or DEFAULT_DATABASE_TARGET


def resolve_optional_int(name):
    raw_value = os.getenv(name, "").strip().strip('"')
    if not raw_value:
        return None
    return int(raw_value)


def resolve_optional_bool(name, default=False):
    raw_value = os.getenv(name, "")
    if not raw_value:
        return default
    return raw_value.strip().strip('"').lower() in {"1", "true", "yes", "on"}


def resolve_prune_mode(name, default="auto"):
    raw_value = os.getenv(name, str(default)).strip().strip('"')
    if not raw_value:
        return default

    normalized = raw_value.lower()
    if normalized in {"auto", "true", "false"}:
        return normalized
    if normalized in {"1", "yes", "on"}:
        return "true"
    if normalized in {"0", "no", "off"}:
        return "false"

    raise ValueError(
        f"Unsupported value for {name}: {raw_value}. Use auto, true or false."
    )


def resolve_csv_env(name, default=""):
    raw_value = os.getenv(name, default)
    return {
        re.sub(r"\s+", " ", str(value)).strip().upper()
        for value in raw_value.split(",")
        if re.sub(r"\s+", " ", str(value)).strip()
    }


POPULATE_DATABASE_TARGET = resolve_populate_database_target()
os.environ["DATABASE_TARGET"] = POPULATE_DATABASE_TARGET

from app.database.connection import SessionLocal, init_db  # noqa: E402


MAX_RETRIES = int(os.getenv("POPULATE_RETRIES", str(DEFAULT_MAX_RETRIES)))
REQUEST_TIMEOUT = int(os.getenv("POPULATE_REQUEST_TIMEOUT", str(DEFAULT_REQUEST_TIMEOUT)))
POPULATE_FETCH_ONLY = resolve_optional_bool("POPULATE_FETCH_ONLY", default=DEFAULT_FETCH_ONLY)
POPULATE_VERBOSE = resolve_optional_bool("POPULATE_VERBOSE", default=DEFAULT_VERBOSE)
POPULATE_PRUNE_STALE_MODE = resolve_prune_mode(
    "POPULATE_PRUNE_STALE",
    default=DEFAULT_PRUNE_STALE_MODE,
)
CARD_GALLERY_URL = os.getenv("RIFTBOUND_CARD_GALLERY_URL", DEFAULT_RIFTBOUND_CARD_GALLERY_URL).strip()
BANS_URL = os.getenv("RIFTBOUND_BANS_URL", DEFAULT_RIFTBOUND_BANS_URL).strip()
SET_CODE_FILTER = resolve_csv_env("RIFTBOUND_SET_CODE_FILTER", DEFAULT_SET_CODE_FILTER)
CARD_CODE_PREFIX = os.getenv("CARD_CODE_PREFIX", os.getenv("CARD_SET_PREFIX", "")).strip().strip('"').upper()
CARD_START = resolve_optional_int("CARD_START")
CARD_END = resolve_optional_int("CARD_END")
HAS_ACTIVE_FILTERS = bool(
    SET_CODE_FILTER
    or CARD_CODE_PREFIX
    or CARD_START is not None
    or CARD_END is not None
)


def html_to_plain_text(value, separator=" "):
    normalized = unescape(str(value or "")).replace("\xa0", " ")
    soup = BeautifulSoup(normalized, "html.parser")
    for br in soup.find_all("br"):
        br.replace_with("\n")
    return soup.get_text(separator, strip=False)


def clean_text(value):
    normalized = html_to_plain_text(value)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def clean_multiline_text(value):
    normalized = html_to_plain_text(value)
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(
        line for line in (clean_text(part) for part in normalized.splitlines()) if line
    )


def clip_text(value, limit):
    normalized = clean_text(value)
    return normalized[:limit] if normalized else None


def to_int(value):
    if value is None:
        return None
    if isinstance(value, int):
        return value
    match = re.search(r"\d+", str(value))
    return int(match.group()) if match else None


def normalize_public_code(value):
    normalized = clean_text(value).upper()
    normalized = re.sub(r"\s+", "", normalized)
    return normalized


def build_riftbound_deck_key(name):
    normalized = re.sub(r"[^A-Z0-9]+", "-", clean_text(name).upper()).strip("-")
    return normalized[:RIFTBOUND_STRING_LIMITS["deck_key"]] or None


def extract_set_code(public_code, fallback_label="", fallback_id=""):
    normalized_public_code = normalize_public_code(public_code)
    prefix_match = re.match(r"^([A-Z0-9]+)-", normalized_public_code)
    if prefix_match:
        return prefix_match.group(1)[:RIFTBOUND_DETAIL_STRING_LIMITS["set_code"]]

    normalized_label = re.sub(r"[^A-Z0-9]+", "-", clean_text(fallback_label).upper()).strip("-")
    if normalized_label:
        return normalized_label[:RIFTBOUND_DETAIL_STRING_LIMITS["set_code"]]

    normalized_id = re.sub(r"[^A-Z0-9]+", "-", clean_text(fallback_id).upper()).strip("-")
    return normalized_id[:RIFTBOUND_DETAIL_STRING_LIMITS["set_code"]] or None


def extract_collector_parts(public_code):
    normalized_public_code = normalize_public_code(public_code)
    match = re.search(r"-([0-9]+)([A-Z*]+)?(?:/[0-9]+)?$", normalized_public_code)
    if not match:
        return None, None
    collector_number = int(match.group(1))
    variant_code = (match.group(2) or "").strip() or None
    return collector_number, variant_code


def extract_label_values(raw_values):
    values = []
    for item in raw_values or []:
        if isinstance(item, dict):
            label = clean_text(item.get("label") or item.get("value") or item.get("id"))
        else:
            label = clean_text(item)
        if label:
            values.append(label)
    return values


def extract_keyword_values(item):
    keyword_candidates = []
    for key in ("keywords", "keyword", "abilities", "abilityKeywords"):
        raw_value = item.get(key)
        if isinstance(raw_value, dict):
            keyword_candidates.extend(extract_label_values(raw_value.get("values") or raw_value.get("items") or raw_value.get("tags")))
        elif isinstance(raw_value, list):
            keyword_candidates.extend(extract_label_values(raw_value))
    deduplicated = []
    for keyword in keyword_candidates:
        if keyword and keyword not in deduplicated:
            deduplicated.append(keyword)
    return deduplicated


def build_card_type(item):
    card_type_data = item.get("cardType") or {}
    super_types = [value.title() for value in extract_label_values(card_type_data.get("superType"))]
    types = [value.title() for value in extract_label_values(card_type_data.get("type"))]

    if "Champion" in super_types and "Unit" in types:
        return "Champion Unit"
    if "Legend" in types:
        return "Legend"
    if types:
        return " / ".join(types)[:RIFTBOUND_STRING_LIMITS["card_type"]]
    if super_types:
        return " / ".join(super_types)[:RIFTBOUND_STRING_LIMITS["card_type"]]
    return None


def infer_champion_tag(tags, domains, is_legend=False, is_champion=False):
    if not tags:
        return None

    domain_set = {value.lower() for value in domains}
    preferred = [
        tag for tag in tags
        if tag
        and tag.lower() not in RIFTBOUND_KNOWN_DOMAINS
        and tag.lower() not in domain_set
    ]
    if preferred:
        return preferred[0][:RIFTBOUND_DETAIL_STRING_LIMITS["champion_tag"]]

    if is_legend or is_champion:
        fallback = clean_text(tags[0])
        return fallback[:RIFTBOUND_DETAIL_STRING_LIMITS["champion_tag"]] if fallback else None

    return None


def should_include_record(record):
    set_code = (record.get("set_code") or "").upper()
    source_card_id = (record.get("source_card_id") or "").upper()
    collector_number = record.get("collector_number")

    if SET_CODE_FILTER and set_code not in SET_CODE_FILTER:
        return False
    if CARD_CODE_PREFIX and not source_card_id.startswith(CARD_CODE_PREFIX):
        return False
    if CARD_START is not None and (collector_number is None or collector_number < CARD_START):
        return False
    if CARD_END is not None and (collector_number is None or collector_number > CARD_END):
        return False
    return True


def fetch_url(session, url):
    last_error = None
    for attempt in range(1, MAX_RETRIES + 2):
        try:
            response = session.get(url, timeout=REQUEST_TIMEOUT, headers=REQUEST_HEADERS)
            response.raise_for_status()
            return response.text
        except Exception as error:
            last_error = error
            if attempt <= MAX_RETRIES:
                time.sleep(min(2 ** attempt, 5))
    raise last_error


def find_riftbound_gallery_items(node):
    if isinstance(node, dict):
        if node.get("type") == "riftboundCardGallery":
            cards = (((node.get("cards") or {}).get("items")) or [])
            if isinstance(cards, list):
                return cards
        for value in node.values():
            items = find_riftbound_gallery_items(value)
            if items:
                return items
    elif isinstance(node, list):
        for value in node:
            items = find_riftbound_gallery_items(value)
            if items:
                return items
    return []


def fetch_card_gallery_items(session):
    html = fetch_url(session, CARD_GALLERY_URL)
    soup = BeautifulSoup(html, "html.parser")
    next_data = soup.find("script", id="__NEXT_DATA__")
    if not next_data or not next_data.string:
        raise RuntimeError("Could not locate __NEXT_DATA__ on the Riftbound card gallery page.")

    payload = json.loads(next_data.string)
    items = find_riftbound_gallery_items(payload)
    if not items:
        raise RuntimeError("No Riftbound card items found in the official card gallery payload.")
    return items


def fetch_standard_bans(session):
    if not BANS_URL:
        return set()

    try:
        html = fetch_url(session, BANS_URL)
    except Exception as error:
        print(f"[riftbound] Could not fetch bans page: {error}")
        return set()

    soup = BeautifulSoup(html, "html.parser")
    candidate_names = set()

    for element in soup.find_all(["li", "strong", "h2", "h3", "p"]):
        text = clean_text(element.get_text(" ", strip=True))
        if not text or len(text) > 120:
            continue
        if not re.search(r"[A-Za-z]", text):
            continue
        if "banned" in text.lower() or "standard" in text.lower() or "riftbound" in text.lower():
            continue
        if text.count(" ") > 8:
            continue
        candidate_names.add(text.lower())

    return candidate_names


def build_riftbound_record(item, banned_names):
    public_code = normalize_public_code(item.get("publicCode"))
    name = clip_text(item.get("name"), RIFTBOUND_STRING_LIMITS["name"])
    set_info = item.get("set") or {}
    set_value = set_info.get("value") or {}
    set_label = clip_text(set_value.get("label"), RIFTBOUND_STRING_LIMITS["set_name"])
    set_id = clean_text(set_value.get("id"))
    set_code = extract_set_code(public_code, set_label, set_id)
    domains = extract_label_values((item.get("domain") or {}).get("values"))
    rarity_label = clip_text(((item.get("rarity") or {}).get("value") or {}).get("label"), RIFTBOUND_STRING_LIMITS["rarity"])
    card_type = build_card_type(item)
    tags = extract_label_values((item.get("tags") or {}).get("tags"))
    keywords = extract_keyword_values(item)
    collector_number, variant_code = extract_collector_parts(public_code)
    description = clean_multiline_text((((item.get("text") or {}).get("richText") or {}).get("body")))
    image_url = clean_text(((item.get("cardImage") or {}).get("url")))
    is_rune = "Rune" in (card_type or "")
    is_battlefield = "Battlefield" in (card_type or "")
    is_legend = "Legend" in (card_type or "")
    is_champion = "Champion" in (card_type or "")
    is_signature = any("signature" in value.lower() for value in [*tags, *keywords])
    champion_tag = infer_champion_tag(tags, domains, is_legend=is_legend, is_champion=is_champion)
    legality_status = "banned-standard" if clean_text(name).lower() in banned_names else "standard"

    record = {
        "source_card_id": public_code[:RIFTBOUND_STRING_LIMITS["source_card_id"]],
        "deck_key": build_riftbound_deck_key(name),
        "name": name,
        "card_type": card_type[:RIFTBOUND_STRING_LIMITS["card_type"]] if card_type else None,
        "cost": to_int((((item.get("energy") or {}).get("value") or {}).get("id"))),
        "color": " / ".join(domains)[:RIFTBOUND_STRING_LIMITS["color"]] if domains else None,
        "rarity": rarity_label,
        "set_name": set_label,
        "version": set_code[:RIFTBOUND_STRING_LIMITS["version"]] if set_code else None,
        "abilities": description,
        "description": description,
        "image_url": image_url,
        "domains": " / ".join(domains) if domains else None,
        "energy_cost": to_int((((item.get("energy") or {}).get("value") or {}).get("id"))),
        "power_cost": to_int((((item.get("power") or {}).get("value") or {}).get("id"))),
        "might": to_int((((item.get("might") or {}).get("value") or {}).get("id"))),
        "tags": "\n".join(tags) if tags else None,
        "keywords": "\n".join(keywords) if keywords else None,
        "champion_tag": champion_tag,
        "is_signature": is_signature,
        "is_rune": is_rune,
        "is_battlefield": is_battlefield,
        "is_legend": is_legend,
        "is_champion": is_champion,
        "collector_number": collector_number,
        "variant_code": variant_code[:RIFTBOUND_DETAIL_STRING_LIMITS["variant_code"]] if variant_code else None,
        "set_code": set_code[:RIFTBOUND_DETAIL_STRING_LIMITS["set_code"]] if set_code else None,
        "legality_status": legality_status[:RIFTBOUND_DETAIL_STRING_LIMITS["legality_status"]],
        "has_errata": False,
        "errata_source_url": None,
        "updated_text": None,
    }

    return record


def should_prune_stale():
    mode = POPULATE_PRUNE_STALE_MODE
    if mode == "true":
        return True
    if mode == "false":
        return False
    return not HAS_ACTIVE_FILTERS


def ensure_riftbound_tgc(db):
    alias_names = {alias.lower() for alias in get_tgc_name_aliases(RIFTBOUND_TCG_NAME)}
    tgc = next(
        (
            item for item in db.query(Tgc).all()
            if (item.name or "").strip().lower() in alias_names
        ),
        None,
    )
    if tgc:
        if tgc.name != RIFTBOUND_TCG_NAME:
            tgc.name = RIFTBOUND_TCG_NAME
        if tgc.description != "Riftbound":
            tgc.description = "Riftbound"
        db.commit()
        return tgc

    tgc = Tgc(name=RIFTBOUND_TCG_NAME, description="Riftbound")
    db.add(tgc)
    db.commit()
    db.refresh(tgc)
    return tgc


def upsert_riftbound_catalog(db, tgc, records):
    existing_cards = (
        db.query(Card)
        .filter(Card.tgc_id == tgc.id)
        .all()
    )
    existing_by_key = {
        ((card.source_card_id or "").upper(), (card.version or "").upper()): card
        for card in existing_cards
    }

    inserted = 0
    updated = 0
    touched_keys = set()

    for record in records:
        key = ((record["source_card_id"] or "").upper(), (record["version"] or "").upper())
        touched_keys.add(key)
        card = existing_by_key.get(key)

        if card is None:
            card = Card(tgc_id=tgc.id)
            db.add(card)
            inserted += 1
        else:
            updated += 1

        card.source_card_id = record["source_card_id"]
        card.deck_key = record["deck_key"]
        card.name = record["name"]
        card.card_type = record["card_type"]
        card.cost = record["cost"]
        card.color = record["color"]
        card.rarity = record["rarity"]
        card.set_name = record["set_name"]
        card.version = record["version"]
        card.abilities = record["abilities"]
        card.description = record["description"]
        card.image_url = record["image_url"]

        db.flush()

        detail = db.query(RiftboundCard).filter(RiftboundCard.card_id == card.id).first()
        if detail is None:
            detail = RiftboundCard(card_id=card.id)
            db.add(detail)

        detail.domains = record["domains"]
        detail.energy_cost = record["energy_cost"]
        detail.power_cost = record["power_cost"]
        detail.might = record["might"]
        detail.tags = record["tags"]
        detail.keywords = record["keywords"]
        detail.champion_tag = record["champion_tag"]
        detail.is_signature = record["is_signature"]
        detail.is_rune = record["is_rune"]
        detail.is_battlefield = record["is_battlefield"]
        detail.is_legend = record["is_legend"]
        detail.is_champion = record["is_champion"]
        detail.collector_number = record["collector_number"]
        detail.variant_code = record["variant_code"]
        detail.set_code = record["set_code"]
        detail.legality_status = record["legality_status"]
        detail.has_errata = record["has_errata"]
        detail.errata_source_url = record["errata_source_url"]
        detail.updated_text = record["updated_text"]

        existing_by_key[key] = card

    db.commit()
    return {
        "inserted": inserted,
        "updated": updated,
        "existing_by_key": existing_by_key,
        "touched_keys": touched_keys,
    }


def prune_stale_cards(db, tgc, touched_keys):
    existing_cards = (
        db.query(Card)
        .filter(Card.tgc_id == tgc.id)
        .all()
    )
    stale_cards = [
        card for card in existing_cards
        if ((card.source_card_id or "").upper(), (card.version or "").upper()) not in touched_keys
    ]
    if not stale_cards:
        return {"stale": 0, "deleted": 0, "preserved": 0}

    stale_ids = [card.id for card in stale_cards]
    referenced_ids = set()

    for model, column in (
        (UserCollection, UserCollection.card_id),
        (DeckCard, DeckCard.card_id),
        (DeckEggCard, DeckEggCard.card_id),
        (DeckConsideringCard, DeckConsideringCard.card_id),
        (DeckZoneCard, DeckZoneCard.card_id),
    ):
        rows = db.query(column).filter(column.in_(stale_ids)).all()
        referenced_ids.update(card_id for card_id, in rows)

    chosen_rows = (
        db.query(Deck.riftbound_chosen_champion_card_id)
        .filter(Deck.riftbound_chosen_champion_card_id.in_(stale_ids))
        .all()
    )
    referenced_ids.update(card_id for card_id, in chosen_rows if card_id is not None)

    deletable_ids = [card_id for card_id in stale_ids if card_id not in referenced_ids]
    if deletable_ids:
        db.query(RiftboundCard).filter(RiftboundCard.card_id.in_(deletable_ids)).delete(synchronize_session=False)
        db.query(Card).filter(Card.id.in_(deletable_ids)).delete(synchronize_session=False)
        db.commit()

    return {
        "stale": len(stale_cards),
        "deleted": len(deletable_ids),
        "preserved": len(referenced_ids),
    }


def main():
    init_db()
    session = requests.Session()
    db = SessionLocal()

    try:
        tgc = ensure_riftbound_tgc(db)
        banned_names = fetch_standard_bans(session)
        raw_items = fetch_card_gallery_items(session)
        records = []

        for item in raw_items:
            record = build_riftbound_record(item, banned_names)
            if should_include_record(record):
                records.append(record)

        unique_records = {}
        for record in records:
            unique_records[(record["source_card_id"], record["version"])] = record
        records = list(unique_records.values())

        if POPULATE_VERBOSE:
            print(f"[riftbound] fetched {len(raw_items)} raw cards, {len(records)} after filters")

        if POPULATE_FETCH_ONLY:
            print(
                json.dumps(
                    {
                        "tgc": RIFTBOUND_TCG_NAME,
                        "fetched_raw_cards": len(raw_items),
                        "filtered_cards": len(records),
                        "set_filters": sorted(SET_CODE_FILTER),
                        "card_code_prefix": CARD_CODE_PREFIX or None,
                    },
                    indent=2,
                    ensure_ascii=False,
                )
            )
            return

        upsert_result = upsert_riftbound_catalog(db, tgc, records)
        prune_result = {"stale": 0, "deleted": 0, "preserved": 0}
        if should_prune_stale():
            prune_result = prune_stale_cards(db, tgc, upsert_result["touched_keys"])

        print(
            json.dumps(
                {
                    "tgc": RIFTBOUND_TCG_NAME,
                    "inserted": upsert_result["inserted"],
                    "updated": upsert_result["updated"],
                    "stale_detected": prune_result["stale"],
                    "stale_deleted": prune_result["deleted"],
                    "stale_preserved": prune_result["preserved"],
                    "filters_active": HAS_ACTIVE_FILTERS,
                    "prune_mode": POPULATE_PRUNE_STALE_MODE,
                },
                indent=2,
                ensure_ascii=False,
            )
        )
    finally:
        db.close()
        session.close()


if __name__ == "__main__":
    main()
