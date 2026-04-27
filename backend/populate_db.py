import hashlib
import os
import re
import time
from html import unescape

import requests

from app.env import load_environment
from app.models import Card, Tgc, GundamCard, OnePieceCard, DeckCard, DeckConsideringCard, UserCollection
from app.database.repositories.tgc_repository import TgcRepository
from app.services.game_rules import GUNDAM_TGC_NAME, ONE_PIECE_TCG_NAME

load_environment()

# Populate settings
# Puedes cambiar estos defaults aqui o sobreescribirlos por variables de entorno.
DEFAULT_DATABASE_TARGET = "PRO"
DEFAULT_TCG_SLUG = "one-piece"
DEFAULT_MAX_RETRIES = 2
DEFAULT_REQUEST_TIMEOUT = 20
DEFAULT_CARDS_PAGE_LIMIT = 100
DEFAULT_APITCG_API_KEY = "069fac02cded932259a2ca204af880222b456ed8ac7e098ce7dfb9b1ed030f0c"
DEFAULT_PRUNE_STALE = True
PRUNE_STALE_SUPPORTED_TCGS = {"one-piece"}

ONE_PIECE_CATALOGS = [
    {
        "label": "set cards",
        "source_type": "set",
        "url": "https://optcgapi.com/api/allSetCards/",
    },
    {
        "label": "starter deck cards",
        "source_type": "deck",
        "url": "https://optcgapi.com/api/allSTCards/",
    },
    {
        "label": "promo cards",
        "source_type": "promo",
        "url": "https://optcgapi.com/api/allPromos/",
    },
    {
        "label": "Don cards",
        "source_type": "don",
        "url": "https://optcgapi.com/api/allDonCards/",
    },
]


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


POPULATE_DATABASE_TARGET = resolve_populate_database_target()
os.environ["DATABASE_TARGET"] = POPULATE_DATABASE_TARGET

from app.database.connection import SessionLocal, init_db

# one-piece, gundam
TCG_SLUG = os.getenv("TCG_SLUG", DEFAULT_TCG_SLUG).strip().lower()
MAX_RETRIES = int(os.getenv("POPULATE_RETRIES", str(DEFAULT_MAX_RETRIES)))
REQUEST_TIMEOUT = int(os.getenv("POPULATE_REQUEST_TIMEOUT", str(DEFAULT_REQUEST_TIMEOUT)))
CARDS_PAGE_LIMIT = max(1, int(os.getenv("CARDS_PAGE_LIMIT", str(DEFAULT_CARDS_PAGE_LIMIT))))
APITCG_API_KEY = os.getenv(
    "APITCG_API_KEY",
    DEFAULT_APITCG_API_KEY,
)
CARD_CODE_PREFIX = os.getenv("CARD_CODE_PREFIX", os.getenv("CARD_SET_PREFIX", "")).strip().strip('"').upper()
CARD_START = resolve_optional_int("CARD_START")
CARD_END = resolve_optional_int("CARD_END")
HAS_ACTIVE_CARD_FILTERS = bool(CARD_CODE_PREFIX or CARD_START is not None or CARD_END is not None)
POPULATE_PRUNE_STALE = resolve_optional_bool("POPULATE_PRUNE_STALE", default=DEFAULT_PRUNE_STALE)

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/147.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}

APITCG_HEADERS = {
    **REQUEST_HEADERS,
    "x-api-key": APITCG_API_KEY,
}

TCG_CONFIG = {
    "gundam": {
        "name": GUNDAM_TGC_NAME,
        "description": "Gundam Card Game",
        "provider": "apitcg",
        "api_slug": "gundam",
        "default_prefix": "GD01",
        "default_end": 299,
    },
    "one-piece": {
        "name": ONE_PIECE_TCG_NAME,
        "description": "One Piece Card Game",
        "provider": "optcg",
        "default_prefix": "OP01",
        "default_end": 200,
        "catalogs": ONE_PIECE_CATALOGS,
    },
}


def get_active_config():
    config = TCG_CONFIG.get(TCG_SLUG)
    if not config:
        raise ValueError(f"Unsupported TCG slug: {TCG_SLUG}")
    return config


def build_filter_description():
    filters = []
    if CARD_CODE_PREFIX:
        filters.append(f"prefix={CARD_CODE_PREFIX}")
    if CARD_START is not None:
        filters.append(f"start={CARD_START}")
    if CARD_END is not None:
        filters.append(f"end={CARD_END}")
    return ", ".join(filters) if filters else "all cards"


def is_prune_stale_requested():
    return POPULATE_PRUNE_STALE and TCG_SLUG in PRUNE_STALE_SUPPORTED_TCGS


def should_prune_stale_cards():
    return is_prune_stale_requested() and not HAS_ACTIVE_CARD_FILTERS


def clean_text(text):
    if text is None:
        return ""
    normalized = unescape(str(text)).replace("\xa0", " ")
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return "" if normalized == "-" else normalized


def clean_multiline_text(text):
    if not text:
        return ""
    normalized = unescape(str(text))
    normalized = normalized.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
    return "\n".join(
        line for line in (clean_text(part) for part in normalized.splitlines()) if line
    )


def normalize_image_url(url):
    cleaned = clean_text(url)
    if not cleaned:
        return ""

    if "images.weserv.nl" in cleaned:
        return cleaned

    if "onepiece-cardgame.com" in cleaned:
        return f"https://images.weserv.nl/?url={cleaned.removeprefix('https://').removeprefix('http://')}"

    return cleaned


def normalize_source_card_code(code):
    cleaned = clean_text(code)
    if not cleaned:
        return ""
    cleaned = re.sub(r"\.(?:jpg|jpeg|png|webp)$", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.replace("_", "-")
    cleaned = re.sub(r"\s+", "", cleaned)
    cleaned = re.sub(r"-{2,}", "-", cleaned)
    return cleaned


def normalize_token(value):
    return re.sub(r"[^A-Z0-9]+", "", clean_text(value).upper())


def has_meaningful_card_code(code):
    normalized = normalize_source_card_code(code)
    if not normalized:
        return False
    return bool(re.search(r"\d", normalized) or "-" in normalized)


def short_hash(value):
    return hashlib.sha1(clean_text(value).encode("utf-8")).hexdigest()[:8].upper()


def extract_version_from_code(code):
    normalized_code = normalize_source_card_code(code)
    match = re.match(r"([A-Z]{1,5}\d{2,})", normalized_code.upper())
    return match.group(1) if match else ""


def extract_one_piece_trigger(text):
    normalized = clean_multiline_text(text)
    if not normalized:
        return ""
    match = re.search(r"\[Trigger\]\s*(.*)", normalized, flags=re.IGNORECASE | re.DOTALL)
    return clean_text(match.group(1)) if match else ""


def to_int(value):
    if value is None or value == "":
        return None
    match = re.search(r"\d+", str(value))
    return int(match.group()) if match else None


def build_session(config):
    session = requests.Session()
    if config.get("provider") == "apitcg":
        session.headers.update(APITCG_HEADERS)
    else:
        session.headers.update(REQUEST_HEADERS)
    return session


def ensure_tgc(db, config):
    tgc_repo = TgcRepository(db)
    tgc = db.query(Tgc).filter(Tgc.name == config["name"]).first()

    if tgc:
        return tgc

    return tgc_repo.create(Tgc(name=config["name"], description=config["description"]))


def extract_card_number(code):
    match = re.search(r"-(\d+)(?:-[A-Za-z0-9]+)?$", code)
    if not match:
        return None
    return int(match.group(1))


def extract_api_card_code(api_card, config, source_type=None):
    if config.get("provider") == "optcg":
        return (
            normalize_source_card_code(api_card.get("card_image_id"))
            or normalize_source_card_code(api_card.get("card_set_id"))
            or normalize_source_card_code(api_card.get("don_id"))
            or normalize_source_card_code(api_card.get("optcg_don_name"))
            or normalize_source_card_code(api_card.get("card_name"))
        ).upper()

    return normalize_source_card_code(api_card.get("code") or api_card.get("id")).upper()


def should_include_card(api_card, config, source_type=None):
    code = extract_api_card_code(api_card, config, source_type)

    if CARD_CODE_PREFIX and not code.startswith(CARD_CODE_PREFIX):
        return False

    if CARD_START is None and CARD_END is None:
        return True

    number = extract_card_number(code)
    if number is None:
        return True

    if CARD_START is not None and number < CARD_START:
        return False

    if CARD_END is not None and number > CARD_END:
        return False

    return True


def fetch_cards_page(session, config, page):
    if config.get("provider") != "apitcg":
        raise ValueError("Paginated page fetch is only supported for ApiTCG providers.")

    url = f"https://www.apitcg.com/api/{config['api_slug']}/cards"
    response = session.get(
        url,
        params={"page": page, "limit": CARDS_PAGE_LIMIT},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data") or []

    if not isinstance(data, list):
        raise ValueError(f"Unexpected cards payload for page {page}")

    total_pages = int(payload.get("totalPages") or 1)
    total_cards = int(payload.get("total") or len(data))
    return data, total_pages, total_cards


def fetch_optcg_catalog(session, catalog):
    response = session.get(catalog["url"], timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    payload = response.json()

    if not isinstance(payload, list):
        raise ValueError(f"Unexpected OPTCG payload for {catalog['label']}")

    return payload


def build_gundam_card_data(api_card):
    code = normalize_source_card_code(api_card.get("code") or api_card.get("id"))
    set_info = api_card.get("set") or {}
    set_name = clean_text(set_info.get("name") or api_card.get("getIt") or GUNDAM_TGC_NAME)
    version = clean_text(set_info.get("id") or code.split("-")[0]).upper()
    description_parts = []

    trait = clean_text(api_card.get("trait"))
    link = clean_text(api_card.get("link"))
    zone = clean_text(api_card.get("zone"))
    source_title = clean_text(api_card.get("sourceTitle"))
    get_it = clean_text(api_card.get("getIt"))

    if trait:
        description_parts.append(f"Traits: {trait}")
    if link:
        description_parts.append(f"Link: {link}")
    if zone:
        description_parts.append(f"Zones: {zone}")
    if source_title:
        description_parts.append(f"Source: {source_title}")
    if get_it:
        description_parts.append(f"Get It: {get_it}")

    return {
        "source_card_id": code,
        "name": clean_text(api_card.get("name") or code),
        "card_type": clean_text(api_card.get("cardType") or "Unknown"),
        "lv": to_int(api_card.get("level")),
        "cost": to_int(api_card.get("cost")),
        "ap": to_int(api_card.get("ap")),
        "hp": to_int(api_card.get("hp")),
        "color": clean_text(api_card.get("color") or "Unknown"),
        "rarity": clean_text(api_card.get("rarity") or "C"),
        "set_name": set_name,
        "version": version,
        "block": None,
        "traits": trait,
        "link": link,
        "zones": zone,
        "artist": "",
        "abilities": clean_multiline_text(api_card.get("effect")),
        "description": "\n".join(description_parts),
        "image_url": normalize_image_url(
            (api_card.get("images") or {}).get("large") or (api_card.get("images") or {}).get("small")
        ),
        "detail_payload": {
            "level": to_int(api_card.get("level")),
            "ap": to_int(api_card.get("ap")),
            "hp": to_int(api_card.get("hp")),
            "block": None,
            "zone": zone,
            "trait": trait,
            "link": link,
            "effect": clean_multiline_text(api_card.get("effect")),
            "source_title": source_title,
            "get_it": get_it,
            "artist": "",
        },
    }


def build_one_piece_apitcg_card_data(api_card):
    code = normalize_source_card_code(api_card.get("code") or api_card.get("id"))
    set_info = api_card.get("set") or {}
    set_name = clean_text(set_info.get("name") or ONE_PIECE_TCG_NAME)
    version_match = re.search(r"\[([A-Z]{2}\d{2})\]", set_name)
    version = version_match.group(1) if version_match else code.split("-")[0]
    family = clean_text(api_card.get("family"))
    trigger = clean_text(api_card.get("trigger"))
    attribute_name = clean_text((api_card.get("attribute") or {}).get("name"))
    counter = clean_text(api_card.get("counter"))

    description_parts = []
    if family:
        description_parts.append(f"Family: {family}")
    if attribute_name:
        description_parts.append(f"Attribute: {attribute_name}")
    if counter:
        description_parts.append(f"Counter: {counter}")
    if trigger:
        description_parts.append(f"Trigger: {trigger}")

    abilities = []
    ability_text = clean_multiline_text(api_card.get("ability"))
    if ability_text:
        abilities.append(ability_text)
    if trigger:
        abilities.append(f"Trigger: {trigger}")

    return {
        "source_card_id": code,
        "name": clean_text(api_card.get("name") or code),
        "card_type": clean_text(api_card.get("type") or "Unknown"),
        "lv": None,
        "cost": to_int(api_card.get("cost")),
        "ap": to_int(api_card.get("power")),
        "hp": None,
        "color": clean_text(api_card.get("color") or "Unknown"),
        "rarity": clean_text(api_card.get("rarity") or "C"),
        "set_name": set_name,
        "version": version,
        "block": None,
        "traits": family,
        "link": "",
        "zones": attribute_name,
        "artist": "",
        "abilities": "\n".join(part for part in abilities if part),
        "description": "\n".join(description_parts),
        "image_url": normalize_image_url(
            (api_card.get("images") or {}).get("large") or (api_card.get("images") or {}).get("small")
        ),
        "detail_payload": {
            "attribute_name": attribute_name,
            "attribute_image": clean_text((api_card.get("attribute") or {}).get("image")),
            "power": to_int(api_card.get("power")),
            "family": family,
            "ability": ability_text,
            "counter": counter,
            "trigger": trigger,
            "notes": "\n".join(clean_text(note) for note in api_card.get("notes") or [] if clean_text(note)),
        },
    }


def build_one_piece_optcg_identity(api_card, source_type):
    image_id = normalize_source_card_code(api_card.get("card_image_id"))
    card_set_id = normalize_source_card_code(api_card.get("card_set_id"))
    card_name = clean_text(api_card.get("card_name"))

    if source_type == "don":
        source_card_id = image_id or normalize_source_card_code(api_card.get("don_id")) or f"don-{short_hash(card_name)}"
        return source_card_id, "DON"

    source_card_id = image_id or card_set_id
    if not source_card_id:
        source_card_id = f"op-{short_hash(card_name)}"

    if source_type == "promo":
        if image_id:
            return source_card_id, "PROMO"
        promo_hash = short_hash(f"{card_set_id}|{card_name}")
        if not has_meaningful_card_code(card_set_id):
            source_card_id = f"P-{promo_hash}"
        return source_card_id, f"PROMO-{promo_hash}"

    version = normalize_token(api_card.get("set_id")) or extract_version_from_code(source_card_id) or "ONEPIECE"
    return source_card_id, version


def build_one_piece_optcg_card_data(api_card, source_type):
    source_card_id, version = build_one_piece_optcg_identity(api_card, source_type)
    set_name = clean_text(api_card.get("set_name"))
    if source_type == "don":
        set_name = clean_text(api_card.get("optcg_don_name") or set_name or "Don!! Cards")

    family = clean_text(api_card.get("sub_types"))
    attribute_name = clean_text(api_card.get("attribute"))
    ability_text = clean_multiline_text(api_card.get("card_text"))
    trigger = extract_one_piece_trigger(ability_text)
    counter = clean_text(api_card.get("counter_amount"))
    life = clean_text(api_card.get("life"))

    description_parts = []
    if source_type == "promo":
        description_parts.append("Catalog: Promotion Cards")
    elif source_type == "deck":
        description_parts.append("Catalog: Starter Deck Cards")
    elif source_type == "don":
        description_parts.append("Catalog: Don Cards")
    if life:
        description_parts.append(f"Life: {life}")
    if attribute_name:
        description_parts.append(f"Attribute: {attribute_name}")
    if counter:
        description_parts.append(f"Counter: {counter}")
    if family:
        description_parts.append(f"Family: {family}")

    notes_parts = []
    if life:
        notes_parts.append(f"Life: {life}")
    if source_type == "promo":
        notes_parts.append("Catalog: Promotion Cards")
    elif source_type == "deck":
        notes_parts.append("Catalog: Starter Deck Cards")
    elif source_type == "don":
        notes_parts.append("Catalog: Don Cards")

    return {
        "source_card_id": source_card_id,
        "name": clean_text(api_card.get("card_name") or source_card_id),
        "card_type": clean_text(api_card.get("card_type") or "Unknown"),
        "lv": None,
        "cost": to_int(api_card.get("card_cost")),
        "ap": to_int(api_card.get("card_power")),
        "hp": None,
        "color": clean_text(api_card.get("card_color") or ""),
        "rarity": clean_text(api_card.get("rarity") or ""),
        "set_name": set_name or ONE_PIECE_TCG_NAME,
        "version": version,
        "block": None,
        "traits": family,
        "link": "",
        "zones": attribute_name,
        "artist": "",
        "abilities": ability_text,
        "description": "\n".join(description_parts),
        "image_url": normalize_image_url(api_card.get("card_image")),
        "detail_payload": {
            "attribute_name": attribute_name,
            "attribute_image": "",
            "power": to_int(api_card.get("card_power")),
            "family": family,
            "ability": ability_text,
            "counter": counter,
            "trigger": trigger,
            "notes": "\n".join(notes_parts),
        },
    }


def build_card_data(api_card, config, source_type=None):
    if TCG_SLUG == "one-piece":
        if config.get("provider") == "optcg":
            return build_one_piece_optcg_card_data(api_card, source_type or "set")
        return build_one_piece_apitcg_card_data(api_card)
    return build_gundam_card_data(api_card)


def normalize_card_identity(source_card_id, version):
    return clean_text(source_card_id), clean_text(version).upper()


def build_card_identity(card_data):
    return normalize_card_identity(card_data.get("source_card_id"), card_data.get("version"))


def score_card_data(card_data):
    values = [
        card_data.get("name"),
        card_data.get("card_type"),
        card_data.get("color"),
        card_data.get("rarity"),
        card_data.get("set_name"),
        card_data.get("version"),
        card_data.get("traits"),
        card_data.get("link"),
        card_data.get("zones"),
        card_data.get("abilities"),
        card_data.get("description"),
        card_data.get("image_url"),
    ]
    score = sum(len(value.strip()) for value in values if isinstance(value, str) and value.strip())

    for numeric_field in ("lv", "cost", "ap", "hp", "block"):
        if card_data.get(numeric_field) is not None:
            score += 5

    detail_payload = card_data.get("detail_payload") or {}
    for value in detail_payload.values():
        if isinstance(value, str) and value.strip():
            score += len(value.strip())
        elif value is not None:
            score += 5

    return score


def merge_card_data(primary, secondary):
    merged = dict(secondary)
    merged.update(primary)

    for key in (
        "name",
        "card_type",
        "color",
        "rarity",
        "set_name",
        "version",
        "traits",
        "link",
        "zones",
        "artist",
        "abilities",
        "description",
        "image_url",
    ):
        if clean_text(merged.get(key)):
            continue
        merged[key] = secondary.get(key) or primary.get(key)

    for key in ("lv", "cost", "ap", "hp", "block"):
        if merged.get(key) is None:
            merged[key] = secondary.get(key) if secondary.get(key) is not None else primary.get(key)

    primary_detail = primary.get("detail_payload") or {}
    secondary_detail = secondary.get("detail_payload") or {}
    merged_detail = dict(secondary_detail)
    merged_detail.update(primary_detail)

    for key in set(primary_detail) | set(secondary_detail):
        primary_value = primary_detail.get(key)
        secondary_value = secondary_detail.get(key)
        if primary_value not in (None, ""):
            merged_detail[key] = primary_value
        else:
            merged_detail[key] = secondary_value

    merged["detail_payload"] = merged_detail
    return merged


def deduplicate_scraped_cards(scraped_cards):
    deduplicated = {}
    duplicate_count = 0

    for card_data in scraped_cards:
        identity = build_card_identity(card_data)
        existing = deduplicated.get(identity)

        if existing is None:
            deduplicated[identity] = card_data
            continue

        duplicate_count += 1
        preferred = card_data if score_card_data(card_data) >= score_card_data(existing) else existing
        fallback = existing if preferred is card_data else card_data
        deduplicated[identity] = merge_card_data(preferred, fallback)

    return list(deduplicated.values()), duplicate_count


def fetch_cards_page_with_retry(session, config, page):
    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return fetch_cards_page(session, config, page)
        except Exception as exc:
            last_error = exc
            if attempt < MAX_RETRIES:
                time.sleep(0.4)

    raise last_error


def fetch_optcg_catalog_with_retry(session, catalog):
    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return fetch_optcg_catalog(session, catalog)
        except Exception as exc:
            last_error = exc
            if attempt < MAX_RETRIES:
                time.sleep(0.4)

    raise last_error


def log_included_card(card_data):
    print(
        f"{card_data['source_card_id']} -> {card_data['name']} | {card_data['color']} | "
        f"type={card_data['card_type']} | cost={card_data['cost']}"
    )


def scrape_cards_paginated(config):
    session = build_session(config)
    scraped_cards = []
    failed_pages = []
    total_pages = None
    total_cards = None

    try:
        page = 1
        while total_pages is None or page <= total_pages:
            try:
                page_cards, fetched_total_pages, fetched_total_cards = fetch_cards_page_with_retry(
                    session,
                    config,
                    page,
                )
            except Exception as exc:
                failed_pages.append(page)
                print(f"Error fetching page {page}: {exc}")
                page += 1
                continue

            total_pages = fetched_total_pages
            total_cards = fetched_total_cards

            included_cards = []
            for api_card in page_cards:
                if not should_include_card(api_card, config):
                    continue
                card_data = build_card_data(api_card, config)
                included_cards.append(card_data)
                log_included_card(card_data)

            scraped_cards.extend(included_cards)
            print(
                f"Page {page}/{total_pages} processed | API cards: {len(page_cards)} | "
                f"Included: {len(included_cards)} | API total: {total_cards}"
            )
            page += 1

        print(
            f"Finished paginated scrape for {config['name']} | "
            f"Filter: {build_filter_description()} | Collected: {len(scraped_cards)}"
        )
        scraped_cards.sort(key=lambda item: (item["source_card_id"], item["version"]))
        failed_pages.sort()
        return scraped_cards, failed_pages
    finally:
        session.close()


def scrape_one_piece_optcg(config):
    if HAS_ACTIVE_CARD_FILTERS and is_prune_stale_requested():
        raise ValueError(
            "Refusing to prune stale One Piece cards during a filtered import. "
            "Disable POPULATE_PRUNE_STALE or run a full import first."
        )

    session = build_session(config)
    scraped_cards = []
    failed_catalogs = []

    try:
        for catalog in config.get("catalogs", []):
            try:
                api_cards = fetch_optcg_catalog_with_retry(session, catalog)
            except Exception as exc:
                failed_catalogs.append(catalog["label"])
                print(f"Error fetching {catalog['label']}: {exc}")
                continue

            included_cards = []
            for api_card in api_cards:
                if not should_include_card(api_card, config, catalog["source_type"]):
                    continue
                card_data = build_card_data(api_card, config, catalog["source_type"])
                included_cards.append(card_data)
                log_included_card(card_data)

            scraped_cards.extend(included_cards)
            print(
                f"Catalog {catalog['label']} processed | API cards: {len(api_cards)} | "
                f"Included: {len(included_cards)}"
            )

        print(
            f"Finished OPTCG scrape for {config['name']} | "
            f"Filter: {build_filter_description()} | Collected: {len(scraped_cards)}"
        )
        scraped_cards.sort(key=lambda item: (item["source_card_id"], item["version"]))
        failed_catalogs.sort()
        return scraped_cards, failed_catalogs
    finally:
        session.close()


def scrape_cards(config):
    if config.get("provider") == "optcg":
        return scrape_one_piece_optcg(config)
    return scrape_cards_paginated(config)


def prune_stale_cards(db, stale_cards):
    stale_card_ids = [card["id"] for card in stale_cards]
    if not stale_card_ids:
        return {"pruned": 0, "skipped_referenced": 0}

    referenced_collection_ids = {
        card_id
        for (card_id,) in db.query(UserCollection.card_id)
        .filter(UserCollection.card_id.in_(stale_card_ids))
        .distinct()
        .all()
    }
    referenced_deck_ids = {
        card_id
        for (card_id,) in db.query(DeckCard.card_id)
        .filter(DeckCard.card_id.in_(stale_card_ids))
        .distinct()
        .all()
    }
    referenced_considering_ids = {
        card_id
        for (card_id,) in db.query(DeckConsideringCard.card_id)
        .filter(DeckConsideringCard.card_id.in_(stale_card_ids))
        .distinct()
        .all()
    }
    referenced_ids = referenced_collection_ids | referenced_deck_ids | referenced_considering_ids
    deletable_ids = [card_id for card_id in stale_card_ids if card_id not in referenced_ids]

    if deletable_ids:
        if TCG_SLUG == "one-piece":
            db.query(OnePieceCard).filter(OnePieceCard.card_id.in_(deletable_ids)).delete(
                synchronize_session=False
            )
        else:
            db.query(GundamCard).filter(GundamCard.card_id.in_(deletable_ids)).delete(
                synchronize_session=False
            )
        db.query(Card).filter(Card.id.in_(deletable_ids)).delete(synchronize_session=False)
        db.commit()

    return {
        "pruned": len(deletable_ids),
        "skipped_referenced": len(referenced_ids),
    }


def upsert_cards(db, tgc_id, scraped_cards):
    normalized_cards, duplicate_count = deduplicate_scraped_cards(scraped_cards)
    existing_cards = (
        db.query(Card.id, Card.source_card_id, Card.version, Card.image_url, Card.name)
        .filter(Card.tgc_id == tgc_id)
        .all()
    )

    existing_by_identity = {
        normalize_card_identity(source_card_id, version): card_id
        for card_id, source_card_id, version, _, _ in existing_cards
        if clean_text(source_card_id) and clean_text(version)
    }
    existing_without_source_by_image = {
        image_url: card_id
        for card_id, source_card_id, _, image_url, _ in existing_cards
        if image_url and not clean_text(source_card_id)
    }
    existing_without_source_by_name = {
        (version, name): card_id
        for card_id, source_card_id, version, _, name in existing_cards
        if version and name and not clean_text(source_card_id)
    }

    update_rows = []
    insert_rows = []

    for card_data in normalized_cards:
        payload = {
            "tgc_id": tgc_id,
            "source_card_id": card_data["source_card_id"],
            "name": card_data["name"],
            "card_type": card_data["card_type"],
            "lv": card_data["lv"],
            "cost": card_data["cost"],
            "ap": card_data["ap"],
            "hp": card_data["hp"],
            "color": card_data["color"],
            "rarity": card_data["rarity"],
            "set_name": card_data["set_name"],
            "version": card_data["version"],
            "block": card_data["block"],
            "traits": card_data["traits"],
            "link": card_data["link"],
            "zones": card_data["zones"],
            "artist": card_data["artist"],
            "abilities": card_data["abilities"],
            "description": card_data["description"],
            "image_url": card_data["image_url"],
        }

        identity = build_card_identity(card_data)
        existing_id = existing_by_identity.get(identity)

        if existing_id is None and not clean_text(card_data["source_card_id"]):
            existing_id = (
                existing_without_source_by_image.get(card_data["image_url"])
                or existing_without_source_by_name.get((card_data["version"], card_data["name"]))
            )

        if existing_id:
            update_rows.append({"id": existing_id, **payload})
        else:
            insert_rows.append(Card(**payload))

    if update_rows:
        db.bulk_update_mappings(Card, update_rows)

    if insert_rows:
        db.bulk_save_objects(insert_rows)

    db.commit()

    sync_detail_tables(db, tgc_id, normalized_cards)

    imported_keys = {build_card_identity(card) for card in normalized_cards}

    stale_cards = [
        {
            "id": card_id,
            "source_card_id": source_card_id,
            "version": version,
            "name": name,
        }
        for card_id, source_card_id, version, _, name in existing_cards
        if clean_text(source_card_id)
        and clean_text(version)
        and normalize_card_identity(source_card_id, version) not in imported_keys
    ]

    prune_result = {"pruned": 0, "skipped_referenced": 0}
    if should_prune_stale_cards():
        prune_result = prune_stale_cards(db, stale_cards)

    return {
        "updated": len(update_rows),
        "inserted": len(insert_rows),
        "stale": len(stale_cards),
        "deduplicated": duplicate_count,
        "pruned": prune_result["pruned"],
        "skipped_referenced": prune_result["skipped_referenced"],
    }


def sync_detail_tables(db, tgc_id, scraped_cards):
    card_rows = (
        db.query(Card.id, Card.source_card_id, Card.version)
        .filter(Card.tgc_id == tgc_id)
        .all()
    )
    card_id_by_identity = {
        normalize_card_identity(source_card_id, version): card_id
        for card_id, source_card_id, version in card_rows
        if clean_text(source_card_id) and clean_text(version)
    }

    if TCG_SLUG == "one-piece":
        existing_details = {
            detail.card_id: detail
            for detail in db.query(OnePieceCard)
            .filter(OnePieceCard.card_id.in_(card_id_by_identity.values()))
            .all()
        }

        for card_data in scraped_cards:
            card_id = card_id_by_identity.get(build_card_identity(card_data))
            if not card_id:
                continue

            payload = card_data.get("detail_payload", {})
            detail = existing_details.get(card_id)

            if detail:
                detail.attribute_name = payload.get("attribute_name", "")
                detail.attribute_image = payload.get("attribute_image", "")
                detail.power = payload.get("power")
                detail.family = payload.get("family", "")
                detail.ability = payload.get("ability", "")
                detail.counter = payload.get("counter", "")
                detail.trigger = payload.get("trigger", "")
                detail.notes = payload.get("notes", "")
            else:
                db.add(
                    OnePieceCard(
                        card_id=card_id,
                        attribute_name=payload.get("attribute_name", ""),
                        attribute_image=payload.get("attribute_image", ""),
                        power=payload.get("power"),
                        family=payload.get("family", ""),
                        ability=payload.get("ability", ""),
                        counter=payload.get("counter", ""),
                        trigger=payload.get("trigger", ""),
                        notes=payload.get("notes", ""),
                    )
                )
    else:
        existing_details = {
            detail.card_id: detail
            for detail in db.query(GundamCard)
            .filter(GundamCard.card_id.in_(card_id_by_identity.values()))
            .all()
        }

        for card_data in scraped_cards:
            card_id = card_id_by_identity.get(build_card_identity(card_data))
            if not card_id:
                continue

            payload = card_data.get("detail_payload", {})
            detail = existing_details.get(card_id)

            if detail:
                detail.level = payload.get("level")
                detail.ap = payload.get("ap")
                detail.hp = payload.get("hp")
                detail.block = payload.get("block")
                detail.zone = payload.get("zone", "")
                detail.trait = payload.get("trait", "")
                detail.link = payload.get("link", "")
                detail.effect = payload.get("effect", "")
                detail.source_title = payload.get("source_title", "")
                detail.get_it = payload.get("get_it", "")
                detail.artist = payload.get("artist", "")
            else:
                db.add(
                    GundamCard(
                        card_id=card_id,
                        level=payload.get("level"),
                        ap=payload.get("ap"),
                        hp=payload.get("hp"),
                        block=payload.get("block"),
                        zone=payload.get("zone", ""),
                        trait=payload.get("trait", ""),
                        link=payload.get("link", ""),
                        effect=payload.get("effect", ""),
                        source_title=payload.get("source_title", ""),
                        get_it=payload.get("get_it", ""),
                        artist=payload.get("artist", ""),
                    )
                )

    db.commit()


def main():
    config = get_active_config()
    init_db()
    db = SessionLocal()

    try:
        print(f"Database target: {POPULATE_DATABASE_TARGET}")
        print(f"Filter: {build_filter_description()}")
        print(f"Provider: {config.get('provider', 'unknown')}")
        tgc = ensure_tgc(db, config)
        scraped_cards, failures = scrape_cards(config)
        result = upsert_cards(db, tgc.id, scraped_cards)

        print("")
        print("Populate summary")
        print(f"- TCG: {config['name']}")
        print(f"- Inserted: {result['inserted']}")
        print(f"- Updated: {result['updated']}")
        print(f"- Existing not seen in this run: {result['stale']}")
        print(f"- Pruned stale unreferenced cards: {result['pruned']}")
        print(f"- Skipped referenced stale cards: {result['skipped_referenced']}")
        print(f"- Deduplicated exact repeats: {result['deduplicated']}")
        print(f"- Failed fetches: {len(failures)}")

        if failures:
            print("- Failed fetch targets:")
            for failure in failures:
                print(f"  {failure}")

        print("")
        if should_prune_stale_cards():
            print("Referenced collection and deck cards were preserved. Only stale unreferenced One Piece cards were deleted.")
        else:
            print("User collections and decks were preserved because stale cards were not deleted.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
