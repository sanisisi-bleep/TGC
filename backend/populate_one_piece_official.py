import os
import re
import time
from collections import defaultdict
from html import unescape
from io import BytesIO
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from pypdf import PdfReader

from app.env import load_environment
from app.models import Card, DeckCard, DeckConsideringCard, DeckEggCard, OnePieceCard, Tgc, UserCollection
from app.services.game_rules import ONE_PIECE_TCG_NAME

load_environment()

# Populate settings
# Puedes ajustar estos valores aqui o sobreescribirlos por variables de entorno.
# Filtros utiles:
# - ONE_PIECE_SET_CODE_FILTER="OP13" para cargar solo ese set.
# - ONE_PIECE_SERIES_ID_FILTER="569113" para cargar solo esa serie oficial.
# - CARD_CODE_PREFIX="OP13-001" para reducir aun mas por codigo de carta.
# - POPULATE_FETCH_ONLY="true" para probar el scrape sin escribir en BBDD.
# - POPULATE_PRUNE_STALE="auto" limpia legacy sin tocar cargas filtradas.
DEFAULT_DATABASE_TARGET = "PRO"
DEFAULT_MAX_RETRIES = 2
DEFAULT_REQUEST_TIMEOUT = 30
DEFAULT_PRUNE_STALE_MODE = "auto"
DEFAULT_FETCH_ONLY = False
DEFAULT_VERBOSE = False
DEFAULT_INCLUDE_VARIANTS = True
DEFAULT_ONE_PIECE_CARDLIST_URL = "https://en.onepiece-cardgame.com/cardlist/"
DEFAULT_ONE_PIECE_FAQ_URL = "https://en.onepiece-cardgame.com/rules/faq/"
DEFAULT_SET_CODE_FILTER = ""
DEFAULT_SERIES_ID_FILTER = ""
DEFAULT_FETCH_FAQ = True

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/147.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

HTML_TAG_RE = re.compile(r"<\s*/?\s*[a-zA-Z][^>]*>")

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

ONE_PIECE_DETAIL_STRING_LIMITS = {
    "attribute_name": 100,
    "attribute_image": 255,
    "counter": 20,
}

SPECIAL_SET_CODES = {
    "promotion card": "PROMOTION",
    "other product card": "OTHER-PRODUCT",
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


def resolve_series_id_filter(name, default=""):
    raw_value = os.getenv(name, default)
    return {
        re.sub(r"\s+", " ", str(value)).strip()
        for value in raw_value.split(",")
        if re.sub(r"\s+", " ", str(value)).strip()
    }


def normalize_filter_token(value):
    return re.sub(r"[^A-Z0-9]+", "", str(value).upper())


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
    "ONE_PIECE_INCLUDE_VARIANTS",
    default=DEFAULT_INCLUDE_VARIANTS,
)
FETCH_FAQ = resolve_optional_bool("ONE_PIECE_FETCH_FAQ", default=DEFAULT_FETCH_FAQ)
CARDLIST_URL = os.getenv("ONE_PIECE_CARDLIST_URL", DEFAULT_ONE_PIECE_CARDLIST_URL).strip()
FAQ_URL = os.getenv("ONE_PIECE_FAQ_URL", DEFAULT_ONE_PIECE_FAQ_URL).strip()
SET_CODE_FILTER = {
    normalize_filter_token(value)
    for value in resolve_csv_env("ONE_PIECE_SET_CODE_FILTER", DEFAULT_SET_CODE_FILTER)
    if normalize_filter_token(value)
}
SERIES_ID_FILTER = resolve_series_id_filter("ONE_PIECE_SERIES_ID_FILTER", DEFAULT_SERIES_ID_FILTER)
CARD_CODE_PREFIX = os.getenv("CARD_CODE_PREFIX", os.getenv("CARD_SET_PREFIX", "")).strip().strip('"').upper()
CARD_START = resolve_optional_int("CARD_START")
CARD_END = resolve_optional_int("CARD_END")
HAS_ACTIVE_FILTERS = bool(
    SET_CODE_FILTER
    or SERIES_ID_FILTER
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


def extract_set_code(label):
    normalized_label = clean_text(label)
    match = re.search(r"\[([A-Z0-9-]+)\]\s*$", normalized_label, flags=re.IGNORECASE)
    if match:
        return match.group(1).upper()

    special = SPECIAL_SET_CODES.get(normalized_label.lower())
    if special:
        return special

    return ""


def normalize_version(set_code):
    return normalize_filter_token(set_code)


def extract_card_number(code):
    match = re.search(r"-(\d+)(?:-[A-Z0-9]+)?$", normalize_source_card_id(code))
    if not match:
        return None
    return int(match.group(1))


def should_include_card_code(code):
    normalized_code = normalize_source_card_id(code)

    if CARD_CODE_PREFIX and not normalized_code.startswith(normalize_source_card_id(CARD_CODE_PREFIX)):
        return False

    if CARD_START is None and CARD_END is None:
        return True

    number = extract_card_number(normalized_code)
    if number is None:
        return True

    if CARD_START is not None and number < CARD_START:
        return False

    if CARD_END is not None and number > CARD_END:
        return False

    return True


def should_include_series(option):
    if SERIES_ID_FILTER and option["id"] not in SERIES_ID_FILTER:
        return False

    if SET_CODE_FILTER and option["set_token"] not in SET_CODE_FILTER:
        return False

    return True


def build_filter_description():
    parts = []
    if SET_CODE_FILTER:
        parts.append(f"sets={', '.join(sorted(SET_CODE_FILTER))}")
    if SERIES_ID_FILTER:
        parts.append(f"series={', '.join(sorted(SERIES_ID_FILTER))}")
    if CARD_CODE_PREFIX:
        parts.append(f"prefix={normalize_source_card_id(CARD_CODE_PREFIX)}")
    if CARD_START is not None:
        parts.append(f"start={CARD_START}")
    if CARD_END is not None:
        parts.append(f"end={CARD_END}")
    return ", ".join(parts) if parts else "all series"


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
    response.encoding = response.apparent_encoding or response.encoding
    return response.text, response.url


def fetch_binary(session, url):
    response = session.get(url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.content


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


def fetch_binary_with_retry(session, url):
    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return fetch_binary(session, url)
        except Exception as exc:  # pragma: no cover - network retry guard
            last_error = exc
            if attempt < MAX_RETRIES:
                time.sleep(0.4)

    raise last_error


def extract_series_options(landing_html):
    soup = BeautifulSoup(landing_html, "html.parser")
    series_select = soup.select_one("select[name='series']")
    if not series_select:
        raise ValueError("No se encontro el selector de series oficial de One Piece.")

    options = []
    for option in series_select.find_all("option"):
        series_id = clean_text(option.get("value"))
        label = clean_text(option.decode_contents())
        if not series_id or not label or label.lower() in {"recording", "all"}:
            continue

        set_code = extract_set_code(label)
        set_token = normalize_version(set_code or label)

        options.append(
            {
                "id": series_id,
                "label": label,
                "set_code": set_code or label,
                "set_token": set_token,
            }
        )

    return options


def extract_attribute_value(node):
    if node is None:
        return ""

    icon_node = node.find("i")
    if icon_node and clean_text(icon_node.get_text(" ", strip=True)):
        return clean_text(icon_node.get_text(" ", strip=True))

    image_node = node.find("img")
    if image_node and clean_text(image_node.get("alt")):
        return clean_text(image_node.get("alt"))

    copy = BeautifulSoup(str(node), "html.parser")
    header = copy.find("h3")
    if header:
        header.decompose()
    return clean_multiline_text(copy.decode_contents())


def extract_attribute_image_url(node, page_url):
    if node is None:
        return ""

    image_node = node.find("img")
    if image_node and image_node.get("src"):
        return urljoin(page_url, image_node.get("src"))

    return ""


def parse_modal_facts(back_col, page_url):
    if back_col is None:
        return {}, "", ""

    facts = {}
    attribute_value = ""
    attribute_image = ""
    selectors = (
        "div.cost",
        "div.attribute",
        "div.power",
        "div.counter",
        "div.color",
        "div.block",
        "div.feature",
        "div.text",
        "div.trigger",
        "div.getInfo",
    )

    for node in back_col.select(", ".join(selectors)):
        label_node = node.find("h3")
        label = clean_text(label_node.get_text(" ", strip=True)) if label_node else ""
        if not label:
            continue

        if "Attribute" in label:
            attribute_value = extract_attribute_value(node)
            attribute_image = extract_attribute_image_url(node, page_url)
            facts["Attribute"] = attribute_value
            continue

        copy = BeautifulSoup(str(node), "html.parser")
        copy_header = copy.find("h3")
        if copy_header:
            copy_header.decompose()

        facts[label] = clean_multiline_text(copy.decode_contents())

    return facts, attribute_value, attribute_image


def build_card_abilities(effect_text, trigger_text):
    blocks = []
    if effect_text:
        blocks.append(effect_text)
    if trigger_text:
        blocks.append(trigger_text if trigger_text.startswith("[Trigger]") else f"[Trigger]\n{trigger_text}")
    return "\n\n".join(block for block in blocks if block)


def build_card_description(set_name):
    return f"Set: {set_name}" if set_name else ""


def build_card_notes(life, source_card_id, deck_key):
    parts = []
    if life:
        parts.append(f"Life: {life}")
    if source_card_id and deck_key and source_card_id != deck_key:
        parts.append(f"Alternative illustration of {deck_key}")
    return "\n".join(parts)


def validate_string_lengths(card_data):
    problems = []

    for field, limit in CARD_STRING_LIMITS.items():
        value = card_data.get(field)
        if isinstance(value, str) and len(value) > limit:
            problems.append(f"{field}={len(value)}/{limit}")

    detail_payload = card_data.get("detail_payload") or {}
    for field, limit in ONE_PIECE_DETAIL_STRING_LIMITS.items():
        value = detail_payload.get(field)
        if isinstance(value, str) and len(value) > limit:
            problems.append(f"detail_payload.{field}={len(value)}/{limit}")

    if problems:
        source_card_id = card_data.get("source_card_id") or "unknown card"
        name = card_data.get("name") or ""
        raise ValueError(
            f"One Piece card {source_card_id} has values longer than the database schema allows: "
            f"{', '.join(problems)}. Name: {name}"
        )


def normalize_card_identity(source_card_id, version):
    return clean_text(source_card_id), clean_text(version).upper()


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
        "abilities",
        "description",
        "image_url",
    ):
        value = card_data.get(key)
        if isinstance(value, str) and value.strip():
            score += len(value.strip())

    for key in ("cost", "ap", "block"):
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
        "abilities",
        "description",
        "image_url",
    ):
        if clean_text(merged.get(key)):
            continue
        merged[key] = secondary.get(key) or primary.get(key)

    for key in ("cost", "ap", "block"):
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
        identity = normalize_card_identity(card_data["source_card_id"], card_data["version"])
        existing = deduplicated.get(identity)
        if existing is None:
            deduplicated[identity] = card_data
            continue

        duplicate_count += 1
        preferred = card_data if score_card_data(card_data) >= score_card_data(existing) else existing
        fallback = existing if preferred is card_data else card_data
        deduplicated[identity] = merge_card_data(preferred, fallback)

    return list(deduplicated.values()), duplicate_count


def expand_set_code_range(start_code, end_code):
    start_match = re.fullmatch(r"([A-Z]+)-?(\d+)", clean_text(start_code).upper())
    end_match = re.fullmatch(r"([A-Z]+)-?(\d+)", clean_text(end_code).upper())
    if not start_match or not end_match:
        return [start_code, end_code]

    start_prefix, start_digits = start_match.groups()
    end_prefix, end_digits = end_match.groups()
    if start_prefix != end_prefix:
        return [start_code, end_code]

    start_number = int(start_digits)
    end_number = int(end_digits)
    if end_number < start_number:
        return [start_code, end_code]

    width = max(len(start_digits), len(end_digits))
    return [f"{start_prefix}-{number:0{width}d}" for number in range(start_number, end_number + 1)]


def extract_faq_set_codes(title):
    normalized_title = clean_text(title)
    if normalized_title.lower() == "promotion cards":
        return ["PROMOTION"]

    matches = re.findall(r"\[([A-Z0-9-]+)\]", normalized_title, flags=re.IGNORECASE)
    if "~" in normalized_title and len(matches) == 2:
        return expand_set_code_range(matches[0].upper(), matches[1].upper())

    return [match.upper() for match in matches]


def extract_faq_entries(faq_html, base_url):
    soup = BeautifulSoup(faq_html, "html.parser")
    entries = []

    for link in soup.select("#faqPdf li > a[href*='/pdf/']"):
        href = clean_text(link.get("href"))
        title_node = link.select_one(".boxTxt h4")
        title = clean_text(title_node.decode_contents()) if title_node else clean_text(link.get_text(" ", strip=True))
        if not href or not title:
            continue

        set_codes = extract_faq_set_codes(title)
        entries.append(
            {
                "title": title,
                "url": urljoin(base_url, href),
                "set_codes": set_codes,
                "set_tokens": {normalize_version(code) for code in set_codes if normalize_version(code)},
            }
        )

    return entries


def should_include_faq_entry(entry, selected_set_tokens):
    if not FETCH_FAQ:
        return False

    if not selected_set_tokens:
        return True

    if not entry["set_tokens"]:
        return False

    return bool(entry["set_tokens"] & selected_set_tokens)


def split_pdf_text_into_lines(text):
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    normalized = re.sub(r"(?<!\n)(?=(?:OP\d{2}|ST\d{2}|EB\d{2}|PRB\d{2}|P)-\d{3}\b)", "\n", normalized)
    return normalized.splitlines()


def parse_faq_pdf_entries(pdf_bytes, source_title):
    reader = PdfReader(BytesIO(pdf_bytes))
    qa_by_card_code = defaultdict(list)
    current_code = None
    current_lines = []

    def flush_current():
        nonlocal current_code, current_lines
        if current_code and current_lines:
            block = "\n".join(line for line in current_lines if line)
            if block:
                qa_by_card_code[current_code].append(block)
        current_code = None
        current_lines = []

    for page in reader.pages:
        text = page.extract_text() or ""
        for raw_line in split_pdf_text_into_lines(text):
            line = clean_text(raw_line)
            if not line:
                continue
            if line.lower().startswith("card no."):
                continue

            match = re.match(
                r"^((?:OP\d{2}|ST\d{2}|EB\d{2}|PRB\d{2}|P)-\d{3})(?:\s+(.*))?$",
                line,
                flags=re.IGNORECASE,
            )
            if match:
                flush_current()
                current_code = normalize_source_card_id(match.group(1))
                current_lines = [f"[{source_title}]"]
                remainder = clean_text(match.group(2))
                if remainder:
                    current_lines.append(remainder)
                continue

            if current_code:
                current_lines.append(line)

    flush_current()

    return {
        card_code: "\n\n".join(blocks)
        for card_code, blocks in qa_by_card_code.items()
        if blocks
    }


def build_qa_map(session, selected_set_tokens):
    if not FETCH_FAQ:
        return {}, []

    faq_html, page_url = fetch_html_with_retry(session, FAQ_URL)
    faq_entries = [
        entry
        for entry in extract_faq_entries(faq_html, page_url)
        if should_include_faq_entry(entry, selected_set_tokens)
    ]

    qa_map = defaultdict(list)
    failed_entries = []

    for entry in faq_entries:
        try:
            pdf_bytes = fetch_binary_with_retry(session, entry["url"])
            parsed_entries = parse_faq_pdf_entries(pdf_bytes, entry["title"])
        except Exception as exc:  # pragma: no cover - network retry guard
            failed_entries.append(entry["title"])
            print(f"Error fetching FAQ {entry['title']}: {exc}")
            continue

        for card_code, qa_text in parsed_entries.items():
            if qa_text:
                qa_map[card_code].append(qa_text)

    return {
        card_code: "\n\n".join(blocks)
        for card_code, blocks in qa_map.items()
        if blocks
    }, failed_entries


def parse_modal_card(modal, series_option, page_url, qa_map):
    modal_id = normalize_source_card_id(modal.get("id"))
    info_spans = [
        clean_text(span.get_text(" ", strip=True))
        for span in modal.select("dt .infoCol span")
        if clean_text(span.get_text(" ", strip=True))
    ]

    deck_key = normalize_source_card_id(info_spans[0] if info_spans else modal_id)
    source_card_id = modal_id or deck_key
    rarity = clean_text(info_spans[1] if len(info_spans) > 1 else "")
    card_type = clean_text(info_spans[2] if len(info_spans) > 2 else "")
    name = clean_text(modal.select_one("dt .cardName").get_text(" ", strip=True) if modal.select_one("dt .cardName") else deck_key)

    front_image = modal.select_one("dd .frontCol img")
    image_path = clean_text((front_image.get("data-src") or front_image.get("src")) if front_image else "")
    image_url = urljoin(page_url, image_path) if image_path else ""

    back_col = modal.select_one("dd .backCol")
    facts, attribute_value, attribute_image = parse_modal_facts(back_col, page_url)

    set_info = clean_text(facts.get("Card Set(s)") or "")
    set_code = extract_set_code(set_info) or series_option["set_code"]
    version = normalize_version(set_code)
    set_name = series_option["label"]
    set_info_token = normalize_filter_token(set_code)
    if set_info and set_info_token != series_option["set_token"]:
        set_name = set_info
    elif set_info and series_option["set_code"] in {"PROMOTION", "OTHER-PRODUCT"}:
        set_name = set_info

    effect_text = facts.get("Effect", "")
    trigger_text = facts.get("Trigger", "")
    family = facts.get("Type", "")
    counter = facts.get("Counter", "")
    life = facts.get("Life", "")
    qa_text = qa_map.get(deck_key, "")

    card_data = {
        "source_card_id": source_card_id,
        "deck_key": deck_key,
        "name": name,
        "card_type": card_type or "Unknown",
        "lv": None,
        "cost": to_int(facts.get("Cost")),
        "ap": to_int(facts.get("Power")),
        "hp": None,
        "color": facts.get("Color", ""),
        "rarity": rarity,
        "set_name": set_name or series_option["label"],
        "version": version,
        "block": to_int(facts.get("Block icon")),
        "traits": family,
        "link": "",
        "zones": "",
        "artist": "",
        "abilities": build_card_abilities(effect_text, trigger_text),
        "description": build_card_description(set_name or series_option["label"]),
        "image_url": image_url,
        "detail_payload": {
            "attribute_name": attribute_value,
            "attribute_image": attribute_image,
            "power": to_int(facts.get("Power")),
            "family": family,
            "ability": effect_text,
            "counter": counter,
            "trigger": trigger_text,
            "notes": build_card_notes(life, source_card_id, deck_key),
            "qa": qa_text,
        },
    }

    validate_string_lengths(card_data)
    return card_data


def scrape_one_piece_cards():
    session = build_session()
    scraped_cards = []
    failed_series = []

    try:
        landing_html, _landing_url = fetch_html_with_retry(session, CARDLIST_URL)
        series_options = [
            option for option in extract_series_options(landing_html)
            if should_include_series(option)
        ]

        if not series_options:
            raise ValueError(
                "No se encontraron series oficiales de One Piece con los filtros actuales."
            )

        selected_set_tokens = {option["set_token"] for option in series_options if option["set_token"]}
        qa_map, failed_faq_entries = build_qa_map(session, selected_set_tokens)

        for series_option in series_options:
            try:
                series_html, page_url = fetch_html_with_retry(
                    session,
                    CARDLIST_URL,
                    params={"series": series_option["id"]},
                )
            except Exception as exc:  # pragma: no cover - network retry guard
                failed_series.append(series_option["label"])
                print(f"Error fetching {series_option['label']}: {exc}")
                continue

            soup = BeautifulSoup(series_html, "html.parser")
            modal_cards = soup.select("dl.modalCol[id]")
            included_cards = []

            for modal in modal_cards:
                card_data = parse_modal_card(modal, series_option, page_url, qa_map)
                is_variant = card_data["source_card_id"] != card_data["deck_key"]
                if is_variant and not INCLUDE_VARIANTS:
                    continue
                if not should_include_card_code(card_data["source_card_id"]):
                    continue

                included_cards.append(card_data)
                if POPULATE_VERBOSE:
                    print(
                        f"{card_data['source_card_id']} -> {card_data['name']} | "
                        f"{card_data['version']} | type={card_data['card_type']} | cost={card_data['cost']}"
                    )

            scraped_cards.extend(included_cards)
            print(
                f"Series {series_option['label']} processed | "
                f"Cards found: {len(modal_cards)} | Included: {len(included_cards)}"
            )

        deduplicated_cards, duplicate_count = deduplicate_cards(scraped_cards)
        deduplicated_cards.sort(key=lambda item: (item["version"], item["deck_key"], item["source_card_id"]))
        failed_series.sort()
        failed_faq_entries.sort()
        print(
            f"Finished One Piece official scrape | Filter: {build_filter_description()} | "
            f"Collected: {len(deduplicated_cards)} | Deduplicated repeats: {duplicate_count}"
        )
        return deduplicated_cards, failed_series, failed_faq_entries, duplicate_count, series_options
    finally:
        session.close()


def ensure_tgc(db):
    tgc = db.query(Tgc).filter(Tgc.name == ONE_PIECE_TCG_NAME).first()
    if tgc:
        return tgc

    tgc = Tgc(name=ONE_PIECE_TCG_NAME, description="One Piece Card Game")
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
        db.query(OnePieceCard).filter(OnePieceCard.card_id.in_(deletable_ids)).delete(synchronize_session=False)
        db.query(Card).filter(Card.id.in_(deletable_ids)).delete(synchronize_session=False)
        db.commit()

    return {
        "pruned": len(deletable_ids),
        "skipped_referenced": len(referenced_ids),
    }


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
        for detail in db.query(OnePieceCard)
        .join(Card, Card.id == OnePieceCard.card_id)
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
            detail = OnePieceCard(card_id=card.id)
            db.add(detail)
            detail_map[card.id] = detail

        detail.attribute_name = detail_payload.get("attribute_name", "")
        detail.attribute_image = detail_payload.get("attribute_image", "")
        detail.power = detail_payload.get("power")
        detail.family = detail_payload.get("family", "")
        detail.ability = detail_payload.get("ability", "")
        detail.counter = detail_payload.get("counter", "")
        detail.trigger = detail_payload.get("trigger", "")
        detail.notes = detail_payload.get("notes", "")
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
            "Refusing to prune stale One Piece cards during a filtered import. "
            "Disable POPULATE_PRUNE_STALE or run a full import first."
        )

    init_db()
    db = SessionLocal()

    try:
        print(f"Database target: {POPULATE_DATABASE_TARGET}")
        print(f"Filter: {build_filter_description()}")
        print(f"Prune stale mode: {build_prune_mode_description()}")
        print(f"Include variants: {INCLUDE_VARIANTS}")
        print(f"Fetch FAQ: {FETCH_FAQ}")

        scraped_cards, failed_series, failed_faq_entries, duplicate_count, selected_series = scrape_one_piece_cards()

        print("Selected One Piece series:")
        for series in selected_series:
            print(f"- {series['label']} ({series['id']})")

        if POPULATE_FETCH_ONLY:
            print("")
            print("Fetch-only summary")
            print(f"- TCG: {ONE_PIECE_TCG_NAME}")
            print(f"- Cards collected: {len(scraped_cards)}")
            print(f"- Deduplicated exact repeats: {duplicate_count}")
            print(f"- Failed series: {len(failed_series)}")
            print(f"- Failed FAQ documents: {len(failed_faq_entries)}")
            return

        tgc = ensure_tgc(db)
        result = upsert_cards(db, tgc.id, scraped_cards)

        print("")
        print("Populate summary")
        print(f"- TCG: {ONE_PIECE_TCG_NAME}")
        print(f"- Inserted: {result['inserted']}")
        print(f"- Updated: {result['updated']}")
        print(f"- Existing not seen in this run: {result['stale']}")
        print(f"- Pruned stale unreferenced cards: {result['pruned']}")
        print(f"- Skipped referenced stale cards: {result['skipped_referenced']}")
        print(f"- Deduplicated exact repeats: {duplicate_count}")
        print(f"- Failed series: {len(failed_series)}")
        print(f"- Failed FAQ documents: {len(failed_faq_entries)}")

        if failed_series:
            print("- Failed series:")
            for label in failed_series:
                print(f"  {label}")

        if failed_faq_entries:
            print("- Failed FAQ documents:")
            for label in failed_faq_entries:
                print(f"  {label}")

        print("")
        if should_prune_stale_cards():
            print("Referenced collection and deck cards were preserved. Only stale unreferenced One Piece cards were deleted.")
        else:
            print("User collections and decks were preserved because stale cards were not deleted.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
