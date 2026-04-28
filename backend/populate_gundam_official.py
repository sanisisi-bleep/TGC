import os
import re
import time
from html import unescape
from urllib.parse import parse_qs, urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from app.env import load_environment
from app.models import Card, DeckCard, DeckConsideringCard, DeckEggCard, GundamCard, Tgc, UserCollection
from app.services.game_rules import GUNDAM_TGC_NAME

load_environment()

# Populate settings
# Puedes ajustar estos valores aqui o sobreescribirlos por variables de entorno.
# Filtros utiles:
# - GUNDAM_SET_CODE_FILTER="GD04" para cargar solo ese set.
# - GUNDAM_PACKAGE_ID_FILTER="616104" para cargar solo ese package oficial.
# - CARD_CODE_PREFIX="GD04-001" para reducir aun mas por codigo de carta.
# - POPULATE_FETCH_ONLY="true" para probar el scrape sin escribir en BBDD.
# - POPULATE_PRUNE_STALE="auto" limpia legacy sin tocar cargas filtradas.
DEFAULT_DATABASE_TARGET = "PRO"
DEFAULT_MAX_RETRIES = 2
DEFAULT_REQUEST_TIMEOUT = 30
DEFAULT_PRUNE_STALE_MODE = "auto"
DEFAULT_FETCH_ONLY = False
DEFAULT_VERBOSE = False
DEFAULT_INCLUDE_VARIANTS = True
DEFAULT_GUNDAM_CARDLIST_URL = "https://www.gundam-gcg.com/en/cards/index.php"
DEFAULT_SET_CODE_FILTER = ""
DEFAULT_PACKAGE_ID_FILTER = ""

DEFAULT_GUNDAM_PACKAGE_OPTIONS = [
    {"id": "616101", "label": "Newtype Rising [GD01]", "set_code": "GD01"},
    {"id": "616102", "label": "Dual Impact [GD02]", "set_code": "GD02"},
    {"id": "616103", "label": "Steel Requiem [GD03]", "set_code": "GD03"},
    {"id": "616104", "label": "Phantom Aria [GD04]", "set_code": "GD04"},
    {"id": "616001", "label": "Heroic Beginnings [ST01]", "set_code": "ST01"},
    {"id": "616002", "label": "Wings of Advance [ST02]", "set_code": "ST02"},
    {"id": "616003", "label": "Zeon's Rush [ST03]", "set_code": "ST03"},
    {"id": "616004", "label": "SEED Strike [ST04]", "set_code": "ST04"},
    {"id": "616005", "label": "Iron Bloom [ST05]", "set_code": "ST05"},
    {"id": "616006", "label": "Clan Unity [ST06]", "set_code": "ST06"},
    {"id": "616007", "label": "Celestial Drive [ST07]", "set_code": "ST07"},
    {"id": "616008", "label": "Flash of Radiance [ST08]", "set_code": "ST08"},
    {"id": "616009", "label": "Destiny Ignition [ST09]", "set_code": "ST09"},
    {"id": "616701", "label": "Other Product Card", "set_code": "OTHER-PRODUCT"},
    {"id": "616000", "label": "Edition Beta", "set_code": "BETA"},
    {"id": "616801", "label": "Basic Cards", "set_code": "BASIC"},
    {"id": "616901", "label": "Promotion card", "set_code": "PROMOTION"},
]

SPECIAL_PACKAGE_SET_CODES = {
    "other product card": "OTHER-PRODUCT",
    "edition beta": "BETA",
    "basic cards": "BASIC",
    "promotion card": "PROMOTION",
}

CARD_STRING_LIMITS = {
    "source_card_id": 50,
    "deck_key": 50,
    "name": 255,
    "card_type": 50,
    "color": 100,
    "rarity": 20,
    "set_name": 255,
    "version": 50,
    "artist": 255,
}

GUNDAM_DETAIL_STRING_LIMITS = {
    "artist": 255,
}

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/147.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

HTML_TAG_RE = re.compile(r"<\s*/?\s*[a-zA-Z][^>]*>")


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
POPULATE_PRUNE_STALE_MODE = resolve_prune_mode(
    "POPULATE_PRUNE_STALE",
    default=DEFAULT_PRUNE_STALE_MODE,
)
POPULATE_FETCH_ONLY = resolve_optional_bool("POPULATE_FETCH_ONLY", default=DEFAULT_FETCH_ONLY)
POPULATE_VERBOSE = resolve_optional_bool("POPULATE_VERBOSE", default=DEFAULT_VERBOSE)
INCLUDE_VARIANTS = resolve_optional_bool(
    "GUNDAM_INCLUDE_VARIANTS",
    default=DEFAULT_INCLUDE_VARIANTS,
)
CARDLIST_URL = os.getenv("GUNDAM_CARDLIST_URL", DEFAULT_GUNDAM_CARDLIST_URL).strip()
SET_CODE_FILTER = resolve_csv_env("GUNDAM_SET_CODE_FILTER", DEFAULT_SET_CODE_FILTER)
PACKAGE_ID_FILTER = resolve_csv_env("GUNDAM_PACKAGE_ID_FILTER", DEFAULT_PACKAGE_ID_FILTER)
CARD_CODE_PREFIX = os.getenv("CARD_CODE_PREFIX", os.getenv("CARD_SET_PREFIX", "")).strip().strip('"').upper()
CARD_START = resolve_optional_int("CARD_START")
CARD_END = resolve_optional_int("CARD_END")
HAS_ACTIVE_FILTERS = bool(
    SET_CODE_FILTER
    or PACKAGE_ID_FILTER
    or CARD_CODE_PREFIX
    or CARD_START is not None
    or CARD_END is not None
)


def html_to_plain_text(value, separator=" "):
    normalized = unescape(str(value)).replace("\xa0", " ")
    if not HTML_TAG_RE.search(normalized):
        return normalized

    soup = BeautifulSoup(normalized, "html.parser")
    for br in soup.find_all("br"):
        br.replace_with("\n")
    return soup.get_text(separator, strip=False)


def clean_text(value):
    if value is None:
        return ""
    normalized = html_to_plain_text(value)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return "" if normalized == "-" else normalized


def clean_multiline_text(value):
    if value is None:
        return ""

    normalized = html_to_plain_text(value)
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(
        line for line in (clean_text(part) for part in normalized.splitlines()) if line
    )


def to_int(value):
    if value is None:
        return None
    match = re.search(r"\d+", str(value))
    return int(match.group()) if match else None


def normalize_source_card_id(value):
    normalized = clean_text(value).upper().replace("_", "-")
    normalized = re.sub(r"\s+", "", normalized)
    normalized = re.sub(r"-{2,}", "-", normalized)
    return normalized


def normalize_set_code(value):
    normalized = re.sub(r"[^A-Z0-9]+", "-", clean_text(value).upper()).strip("-")
    return normalized[:50]


def looks_like_package_label(label):
    normalized = clean_text(label)
    if not normalized:
        return False
    if normalized.upper() == "ALL":
        return False
    return ("[" in normalized and "]" in normalized) or normalized.lower() in SPECIAL_PACKAGE_SET_CODES


def extract_set_code(label):
    normalized_label = clean_text(label)
    match = re.search(r"\[([A-Z0-9-]+)\]\s*$", normalized_label, flags=re.IGNORECASE)
    if match:
        return match.group(1).upper()

    special_set_code = SPECIAL_PACKAGE_SET_CODES.get(normalized_label.lower())
    if special_set_code:
        return special_set_code

    return normalize_set_code(normalized_label)


def extract_card_number(code):
    match = re.search(r"-(\d+)(?:-[A-Z0-9]+)?$", code)
    if not match:
        return None
    return int(match.group(1))


def is_variant_code(code):
    normalized_code = normalize_source_card_id(code)
    return bool(re.search(r"-P\d+$", normalized_code, flags=re.IGNORECASE))


def should_include_card_code(code):
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


def should_include_package(option):
    if PACKAGE_ID_FILTER and option["id"].upper() not in PACKAGE_ID_FILTER:
        return False

    if SET_CODE_FILTER and option["set_code"].upper() not in SET_CODE_FILTER:
        return False

    return True


def build_filter_description():
    parts = []
    if SET_CODE_FILTER:
        parts.append(f"sets={', '.join(sorted(SET_CODE_FILTER))}")
    if PACKAGE_ID_FILTER:
        parts.append(f"packages={', '.join(sorted(PACKAGE_ID_FILTER))}")
    if CARD_CODE_PREFIX:
        parts.append(f"prefix={CARD_CODE_PREFIX}")
    if CARD_START is not None:
        parts.append(f"start={CARD_START}")
    if CARD_END is not None:
        parts.append(f"end={CARD_END}")
    return ", ".join(parts) if parts else "all packages"


def build_prune_mode_description():
    if POPULATE_PRUNE_STALE_MODE == "auto":
        return "auto (full imports only)"
    return POPULATE_PRUNE_STALE_MODE


def build_session():
    session = requests.Session()
    session.trust_env = False
    session.headers.update(REQUEST_HEADERS)
    return session


def fetch_html(session, url, params=None):
    response = session.get(url, params=params, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.text, response.url


def fetch_html_with_retry(session, url, params=None):
    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return fetch_html(session, url, params=params)
        except Exception as exc:  # pragma: no cover - network retry guard
            last_error = exc
            if attempt < MAX_RETRIES:
                time.sleep(0.4)

    raise last_error


def build_package_option(package_id, label):
    return {
        "id": clean_text(package_id),
        "label": clean_text(label),
        "set_code": extract_set_code(label),
    }


def merge_package_options(live_options):
    merged_by_id = {
        option["id"]: dict(option)
        for option in DEFAULT_GUNDAM_PACKAGE_OPTIONS
    }

    for option in live_options:
        existing = merged_by_id.get(option["id"], {})
        merged_by_id[option["id"]] = {
            **existing,
            **option,
            "set_code": option.get("set_code") or existing.get("set_code") or extract_set_code(option["label"]),
        }

    ordered_options = []
    consumed_ids = set()

    for fallback_option in DEFAULT_GUNDAM_PACKAGE_OPTIONS:
        package_id = fallback_option["id"]
        ordered_options.append(merged_by_id[package_id])
        consumed_ids.add(package_id)

    for package_id in sorted(merged_by_id):
        if package_id in consumed_ids:
            continue
        ordered_options.append(merged_by_id[package_id])

    return ordered_options


def extract_package_options(landing_html):
    soup = BeautifulSoup(landing_html, "html.parser")
    options = []
    seen_ids = set()

    for option in soup.find_all("option"):
        package_id = clean_text(option.get("value"))
        label = clean_text(option.get_text(" ", strip=True))
        if not re.fullmatch(r"\d{6}", package_id) or not looks_like_package_label(label):
            continue
        if package_id in seen_ids:
            continue
        seen_ids.add(package_id)
        options.append(build_package_option(package_id, label))

    for node in soup.select("[data-package],[data-value],[data-id]"):
        package_id = clean_text(node.get("data-package") or node.get("data-value") or node.get("data-id"))
        label = clean_text(node.get_text(" ", strip=True))
        if not re.fullmatch(r"\d{6}", package_id) or not looks_like_package_label(label):
            continue
        if package_id in seen_ids:
            continue
        seen_ids.add(package_id)
        options.append(build_package_option(package_id, label))

    return merge_package_options(options)


def extract_detail_search(raw_src):
    parsed = urlparse(raw_src)
    detail_search_values = parse_qs(parsed.query).get("detailSearch") or []
    return clean_text(detail_search_values[0]) if detail_search_values else ""


def extract_result_refs(search_html, page_url):
    soup = BeautifulSoup(search_html, "html.parser")
    refs = []
    seen_searches = set()

    for link in soup.select("a.cardStr[data-src]"):
        raw_src = clean_text(link.get("data-src"))
        detail_search = extract_detail_search(raw_src)
        if not detail_search or detail_search in seen_searches:
            continue
        seen_searches.add(detail_search)
        refs.append(
            {
                "detail_search": detail_search,
                "detail_url": urljoin(page_url, raw_src),
            }
        )

    return refs


def parse_fact_boxes(detail_soup):
    facts = {}

    for data_box in detail_soup.select("dl.dataBox"):
        label_node = data_box.select_one(".dataTit")
        value_node = data_box.select_one(".dataTxt")
        label = clean_text(label_node.get_text(" ", strip=True)) if label_node else ""
        if not label or value_node is None:
            continue
        facts[label] = clean_multiline_text(value_node.decode_contents())

    return facts


def get_fact_value(facts, *labels):
    normalized_facts = {
        clean_text(key).lower(): value
        for key, value in facts.items()
        if clean_text(key)
    }

    for label in labels:
        value = normalized_facts.get(clean_text(label).lower())
        if value:
            return value

    return ""


def parse_card_qa(detail_soup):
    qa_entries = []

    for qa_item in detail_soup.select(".cardQaCol .qaCol"):
        question_number = clean_text(
            qa_item.select_one(".qaColNum").get_text(" ", strip=True)
        ) if qa_item.select_one(".qaColNum") else ""
        question_date = clean_text(
            qa_item.select_one(".qaColDate").get_text(" ", strip=True)
        ) if qa_item.select_one(".qaColDate") else ""
        question_text = clean_multiline_text(
            qa_item.select_one(".qaColQuestion").decode_contents()
        ) if qa_item.select_one(".qaColQuestion") else ""
        answer_text = clean_multiline_text(
            qa_item.select_one(".qaColAnswer").decode_contents()
        ) if qa_item.select_one(".qaColAnswer") else ""

        lines = []
        header = " | ".join(part for part in [question_number, question_date] if part)
        if header:
            lines.append(header)
        if question_text:
            lines.append(f"Q: {question_text}")
        if answer_text:
            lines.append(f"A: {answer_text}")

        if lines:
            qa_entries.append("\n".join(lines))

    return "\n\n".join(qa_entries)


def build_card_description(source_title, get_it, source_card_id, deck_key):
    parts = []
    if source_title:
        parts.append(f"Source: {source_title}")
    if get_it:
        parts.append(f"Where to get it: {get_it}")
    if source_card_id and deck_key and source_card_id != deck_key:
        parts.append(f"Variant ID: {source_card_id}")
    return "\n".join(parts)


def validate_string_lengths(card_data):
    problems = []

    for field, limit in CARD_STRING_LIMITS.items():
        value = card_data.get(field)
        if isinstance(value, str) and len(value) > limit:
            problems.append(f"{field}={len(value)}/{limit}")

    detail_payload = card_data.get("detail_payload") or {}
    for field, limit in GUNDAM_DETAIL_STRING_LIMITS.items():
        value = detail_payload.get(field)
        if isinstance(value, str) and len(value) > limit:
            problems.append(f"detail_payload.{field}={len(value)}/{limit}")

    if problems:
        source_card_id = card_data.get("source_card_id") or "unknown card"
        name = card_data.get("name") or ""
        raise ValueError(
            f"Gundam card {source_card_id} has values longer than the database schema allows: "
            f"{', '.join(problems)}. Name: {name}"
        )


def parse_detail_card(detail_html, detail_url, package_option, raw_detail_search):
    soup = BeautifulSoup(detail_html, "html.parser")
    facts = parse_fact_boxes(soup)

    card_number = normalize_source_card_id(
        soup.select_one(".cardNo").get_text(" ", strip=True) if soup.select_one(".cardNo") else raw_detail_search
    )
    source_card_id = normalize_source_card_id(raw_detail_search or card_number)
    deck_key = card_number or source_card_id
    name = clean_text(
        soup.select_one(".cardName").get_text(" ", strip=True) if soup.select_one(".cardName") else deck_key
    )
    rarity = clean_text(
        soup.select_one(".rarity").get_text(" ", strip=True) if soup.select_one(".rarity") else ""
    )
    block = to_int(
        soup.select_one(".blockIcon").get_text(" ", strip=True) if soup.select_one(".blockIcon") else ""
    )

    image_node = None
    for selector in (
        ".cardImage img",
        ".swiper-slide img",
        ".cardVisual img",
        ".detailCol img",
        ".galleryThumb img",
    ):
        image_node = soup.select_one(selector)
        if image_node and image_node.get("src"):
            break
    if image_node is None:
        fallback_image = soup.find("img")
        if fallback_image and fallback_image.get("src"):
            image_node = fallback_image
    image_url = urljoin(detail_url, image_node.get("src")) if image_node and image_node.get("src") else ""

    effect_node = soup.select_one(".cardDataRow.overview .dataTxt")
    effect_text = clean_multiline_text(effect_node.decode_contents()) if effect_node else ""
    if not effect_text:
        effect_text = get_fact_value(facts, "Effect", "Text")

    source_title = get_fact_value(facts, "Source Title")
    get_it = get_fact_value(facts, "Where to get it")
    artist = get_fact_value(facts, "Artist", "Illustrator")
    qa = parse_card_qa(soup)

    card_data = {
        "source_card_id": source_card_id,
        "deck_key": deck_key,
        "name": name,
        "card_type": get_fact_value(facts, "TYPE", "Type") or "Unknown",
        "lv": to_int(get_fact_value(facts, "Lv.", "Lv", "Level")),
        "cost": to_int(get_fact_value(facts, "COST", "Cost")),
        "ap": to_int(get_fact_value(facts, "AP")),
        "hp": to_int(get_fact_value(facts, "HP")),
        "color": get_fact_value(facts, "COLOR", "Color"),
        "rarity": rarity,
        "set_name": package_option["label"],
        "version": package_option["set_code"],
        "block": block,
        "traits": get_fact_value(facts, "Trait"),
        "link": get_fact_value(facts, "Link"),
        "zones": get_fact_value(facts, "Zone"),
        "artist": artist,
        "abilities": effect_text,
        "description": build_card_description(source_title, get_it, source_card_id, deck_key),
        "image_url": image_url,
        "detail_payload": {
            "level": to_int(get_fact_value(facts, "Lv.", "Lv", "Level")),
            "ap": to_int(get_fact_value(facts, "AP")),
            "hp": to_int(get_fact_value(facts, "HP")),
            "block": block,
            "zone": get_fact_value(facts, "Zone"),
            "trait": get_fact_value(facts, "Trait"),
            "link": get_fact_value(facts, "Link"),
            "effect": effect_text,
            "source_title": source_title,
            "get_it": get_it,
            "artist": artist,
            "qa": qa,
        },
    }

    validate_string_lengths(card_data)
    return card_data


def score_card_data(card_data):
    score = 0
    for key in (
        "source_card_id",
        "deck_key",
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
        value = card_data.get(key)
        if isinstance(value, str) and value.strip():
            score += len(value.strip())

    for key in ("lv", "cost", "ap", "hp", "block"):
        if card_data.get(key) is not None:
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
        "source_card_id",
        "deck_key",
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

    merged_detail = dict(secondary.get("detail_payload") or {})
    merged_detail.update(primary.get("detail_payload") or {})
    merged["detail_payload"] = merged_detail
    return merged


def deduplicate_cards(scraped_cards):
    deduplicated = {}
    duplicate_count = 0

    for card_data in scraped_cards:
        identity = (card_data["source_card_id"], card_data["version"])
        existing = deduplicated.get(identity)
        if existing is None:
            deduplicated[identity] = card_data
            continue

        duplicate_count += 1
        preferred = card_data if score_card_data(card_data) >= score_card_data(existing) else existing
        fallback = existing if preferred is card_data else card_data
        deduplicated[identity] = merge_card_data(preferred, fallback)

    return list(deduplicated.values()), duplicate_count


def scrape_gundam_cards():
    session = build_session()
    scraped_cards = []
    failed_targets = []
    live_package_warning = None

    try:
        try:
            landing_html, _landing_url = fetch_html_with_retry(session, CARDLIST_URL)
            package_options = extract_package_options(landing_html)
        except Exception as exc:  # pragma: no cover - network retry guard
            live_package_warning = f"Falling back to embedded package list: {exc}"
            package_options = list(DEFAULT_GUNDAM_PACKAGE_OPTIONS)

        selected_packages = [
            option for option in package_options
            if should_include_package(option)
        ]

        if not selected_packages:
            raise ValueError(
                "No Gundam package matched the active filters. "
                f"Filter: {build_filter_description()}"
            )

        for package in selected_packages:
            try:
                search_html, page_url = fetch_html_with_retry(
                    session,
                    CARDLIST_URL,
                    params={"search": "true", "package": package["id"]},
                )
            except Exception as exc:  # pragma: no cover - network retry guard
                failed_targets.append(package["label"])
                print(f"Error fetching {package['label']}: {exc}")
                continue

            result_refs = extract_result_refs(search_html, page_url)
            included_cards = []

            for result_ref in result_refs:
                normalized_code = normalize_source_card_id(result_ref["detail_search"])
                if is_variant_code(normalized_code) and not INCLUDE_VARIANTS:
                    continue
                if not should_include_card_code(normalized_code):
                    continue

                try:
                    detail_html, detail_url = fetch_html_with_retry(session, result_ref["detail_url"])
                    card_data = parse_detail_card(
                        detail_html,
                        detail_url,
                        package,
                        result_ref["detail_search"],
                    )
                except Exception as exc:  # pragma: no cover - network retry guard
                    failed_targets.append(f"{package['label']}::{result_ref['detail_search']}")
                    print(f"Error fetching {package['label']} / {result_ref['detail_search']}: {exc}")
                    continue

                included_cards.append(card_data)
                if POPULATE_VERBOSE:
                    print(
                        f"{card_data['source_card_id']} -> {card_data['name']} | "
                        f"{card_data['color'] or ''} | type={card_data['card_type']} | cost={card_data['cost']}"
                    )

            scraped_cards.extend(included_cards)
            print(
                f"Package {package['label']} processed | "
                f"Cards found: {len(result_refs)} | Included: {len(included_cards)}"
            )

        deduplicated_cards, duplicate_count = deduplicate_cards(scraped_cards)
        deduplicated_cards.sort(key=lambda item: (item["version"], item["deck_key"], item["source_card_id"]))
        failed_targets.sort()

        print(
            f"Finished official Gundam scrape | Filter: {build_filter_description()} | "
            f"Collected: {len(deduplicated_cards)} | Deduplicated repeats: {duplicate_count}"
        )

        if live_package_warning:
            print(live_package_warning)

        return deduplicated_cards, failed_targets, duplicate_count, selected_packages
    finally:
        session.close()


def ensure_tgc(db):
    tgc = db.query(Tgc).filter(Tgc.name == GUNDAM_TGC_NAME).first()
    if tgc:
        return tgc

    tgc = Tgc(name=GUNDAM_TGC_NAME, description="Gundam Card Game")
    db.add(tgc)
    db.commit()
    db.refresh(tgc)
    return tgc


def should_prune_stale_cards():
    if POPULATE_PRUNE_STALE_MODE == "false":
        return False
    return not HAS_ACTIVE_FILTERS


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
    referenced_egg_ids = {
        card_id
        for (card_id,) in db.query(DeckEggCard.card_id)
        .filter(DeckEggCard.card_id.in_(stale_card_ids))
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

    referenced_ids = referenced_collection_ids | referenced_deck_ids | referenced_egg_ids | referenced_considering_ids
    deletable_ids = [card_id for card_id in stale_card_ids if card_id not in referenced_ids]

    if deletable_ids:
        db.query(GundamCard).filter(GundamCard.card_id.in_(deletable_ids)).delete(synchronize_session=False)
        db.query(Card).filter(Card.id.in_(deletable_ids)).delete(synchronize_session=False)
        db.commit()

    return {
        "pruned": len(deletable_ids),
        "skipped_referenced": len(referenced_ids),
    }


def normalize_card_identity(source_card_id, version):
    return clean_text(source_card_id), clean_text(version).upper()


def upsert_cards(db, tgc_id, scraped_cards):
    existing_cards = (
        db.query(Card)
        .filter(Card.tgc_id == tgc_id)
        .all()
    )
    existing_by_identity = {
        normalize_card_identity(card.source_card_id, card.version): card
        for card in existing_cards
        if clean_text(card.source_card_id) and clean_text(card.version)
    }
    detail_map = {
        detail.card_id: detail
        for detail in db.query(GundamCard)
        .join(Card, Card.id == GundamCard.card_id)
        .filter(Card.tgc_id == tgc_id)
        .all()
    }

    inserted = 0
    updated = 0
    imported_keys = set()

    for card_data in scraped_cards:
        identity = normalize_card_identity(card_data["source_card_id"], card_data["version"])
        imported_keys.add(identity)
        card = existing_by_identity.get(identity)

        if card is None:
            card = Card(
                tgc_id=tgc_id,
                source_card_id=card_data["source_card_id"],
                deck_key=card_data["deck_key"],
                name=card_data["name"],
                card_type=card_data["card_type"],
                lv=card_data["lv"],
                cost=card_data["cost"],
                ap=card_data["ap"],
                hp=card_data["hp"],
                color=card_data["color"],
                rarity=card_data["rarity"],
                set_name=card_data["set_name"],
                version=card_data["version"],
                block=card_data["block"],
                traits=card_data["traits"],
                link=card_data["link"],
                zones=card_data["zones"],
                artist=card_data["artist"],
                abilities=card_data["abilities"],
                description=card_data["description"],
                image_url=card_data["image_url"],
            )
            db.add(card)
            db.flush()
            existing_by_identity[identity] = card
            inserted += 1
        else:
            card.source_card_id = card_data["source_card_id"]
            card.deck_key = card_data["deck_key"]
            card.name = card_data["name"]
            card.card_type = card_data["card_type"]
            card.lv = card_data["lv"]
            card.cost = card_data["cost"]
            card.ap = card_data["ap"]
            card.hp = card_data["hp"]
            card.color = card_data["color"]
            card.rarity = card_data["rarity"]
            card.set_name = card_data["set_name"]
            card.version = card_data["version"]
            card.block = card_data["block"]
            card.traits = card_data["traits"]
            card.link = card_data["link"]
            card.zones = card_data["zones"]
            card.artist = card_data["artist"]
            card.abilities = card_data["abilities"]
            card.description = card_data["description"]
            card.image_url = card_data["image_url"]
            updated += 1

        detail_payload = card_data["detail_payload"]
        detail = detail_map.get(card.id)
        if detail is None:
            detail = GundamCard(card_id=card.id)
            db.add(detail)
            detail_map[card.id] = detail

        detail.level = detail_payload.get("level")
        detail.ap = detail_payload.get("ap")
        detail.hp = detail_payload.get("hp")
        detail.block = detail_payload.get("block")
        detail.zone = detail_payload.get("zone", "")
        detail.trait = detail_payload.get("trait", "")
        detail.link = detail_payload.get("link", "")
        detail.effect = detail_payload.get("effect", "")
        detail.source_title = detail_payload.get("source_title", "")
        detail.get_it = detail_payload.get("get_it", "")
        detail.artist = detail_payload.get("artist", "")
        detail.qa = detail_payload.get("qa", "")

    db.commit()

    stale_cards = [
        {
            "id": card.id,
            "source_card_id": card.source_card_id,
            "version": card.version,
            "name": card.name,
        }
        for card in existing_cards
        if clean_text(card.source_card_id)
        and clean_text(card.version)
        and normalize_card_identity(card.source_card_id, card.version) not in imported_keys
    ]

    prune_result = {"pruned": 0, "skipped_referenced": 0}
    if should_prune_stale_cards():
        prune_result = prune_stale_cards(db, stale_cards)

    return {
        "inserted": inserted,
        "updated": updated,
        "stale": len(stale_cards),
        "pruned": prune_result["pruned"],
        "skipped_referenced": prune_result["skipped_referenced"],
    }


def main():
    if POPULATE_PRUNE_STALE_MODE == "true" and HAS_ACTIVE_FILTERS:
        raise ValueError(
            "Refusing to prune stale Gundam cards during a filtered import. "
            "Disable POPULATE_PRUNE_STALE or run a full import first."
        )

    init_db()
    db = SessionLocal()

    try:
        print(f"Database target: {POPULATE_DATABASE_TARGET}")
        print(f"Filter: {build_filter_description()}")
        print(f"Prune stale mode: {build_prune_mode_description()}")
        print(f"Include variants: {INCLUDE_VARIANTS}")

        scraped_cards, failed_targets, duplicate_count, selected_packages = scrape_gundam_cards()

        print("Selected Gundam packages:")
        for package in selected_packages:
            print(f"- {package['label']} ({package['id']})")

        if POPULATE_FETCH_ONLY:
            print("")
            print("Fetch-only summary")
            print(f"- TCG: {GUNDAM_TGC_NAME}")
            print(f"- Cards collected: {len(scraped_cards)}")
            print(f"- Deduplicated exact repeats: {duplicate_count}")
            print(f"- Failed targets: {len(failed_targets)}")
            return

        tgc = ensure_tgc(db)
        result = upsert_cards(db, tgc.id, scraped_cards)

        print("")
        print("Populate summary")
        print(f"- TCG: {GUNDAM_TGC_NAME}")
        print(f"- Inserted: {result['inserted']}")
        print(f"- Updated: {result['updated']}")
        print(f"- Existing not seen in this run: {result['stale']}")
        print(f"- Pruned stale unreferenced cards: {result['pruned']}")
        print(f"- Skipped referenced stale cards: {result['skipped_referenced']}")
        print(f"- Deduplicated exact repeats: {duplicate_count}")
        print(f"- Failed targets: {len(failed_targets)}")

        if failed_targets:
            print("- Failed targets:")
            for target in failed_targets:
                print(f"  {target}")

        print("")
        if should_prune_stale_cards():
            print("Referenced collection and deck cards were preserved. Only stale unreferenced Gundam cards were deleted.")
        else:
            print("User collections and decks were preserved because stale cards were not deleted.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
