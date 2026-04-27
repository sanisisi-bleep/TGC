import os
import re
import time
from html import unescape
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from app.env import load_environment
from app.models import Card, DeckCard, DeckConsideringCard, DeckEggCard, DigimonCard, Tgc, UserCollection
from app.services.game_rules import DIGIMON_TCG_NAME

load_environment()

# Populate settings
# Puedes ajustar estos valores aqui o sobreescribirlos por variables de entorno.
DEFAULT_DATABASE_TARGET = "PRO"
DEFAULT_MAX_RETRIES = 2
DEFAULT_REQUEST_TIMEOUT = 30
DEFAULT_PRUNE_STALE = False
DEFAULT_INCLUDE_ALTERNATIVE_ART = True
DEFAULT_DIGIMON_CARDLIST_URL = "https://world.digimoncard.com/cardlist/"
DEFAULT_SET_CODE_FILTER = ""
DEFAULT_CATEGORY_ID_FILTER = ""


def resolve_populate_database_target():
    raw_target = os.getenv("POPULATE_DATABASE_TARGET", DEFAULT_DATABASE_TARGET)
    normalized = raw_target.strip().strip('"').upper()
    return normalized or DEFAULT_DATABASE_TARGET


def resolve_optional_bool(name, default=False):
    raw_value = os.getenv(name, "")
    if not raw_value:
        return default
    return raw_value.strip().strip('"').lower() in {"1", "true", "yes", "on"}


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
POPULATE_PRUNE_STALE = resolve_optional_bool("POPULATE_PRUNE_STALE", default=DEFAULT_PRUNE_STALE)
INCLUDE_ALTERNATIVE_ART = resolve_optional_bool(
    "DIGIMON_INCLUDE_ALTERNATIVE_ART",
    default=DEFAULT_INCLUDE_ALTERNATIVE_ART,
)
CARDLIST_URL = os.getenv("DIGIMON_CARDLIST_URL", DEFAULT_DIGIMON_CARDLIST_URL).strip()
SET_CODE_FILTER = resolve_csv_env("DIGIMON_SET_CODE_FILTER", DEFAULT_SET_CODE_FILTER)
CATEGORY_ID_FILTER = resolve_csv_env("DIGIMON_CATEGORY_ID_FILTER", DEFAULT_CATEGORY_ID_FILTER)
HAS_ACTIVE_FILTERS = bool(SET_CODE_FILTER or CATEGORY_ID_FILTER)

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

DIGIMON_DETAIL_STRING_LIMITS = {
    "form": 100,
    "attribute": 100,
}

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/147.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def clean_text(value):
    if value is None:
        return ""
    normalized = unescape(str(value)).replace("\xa0", " ")
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def clean_multiline_text(value):
    if value is None:
        return ""

    normalized = unescape(str(value))
    normalized = normalized.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
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
    match = re.search(r"\[([A-Z0-9-]+)\]\s*$", clean_text(label), flags=re.IGNORECASE)
    if match:
        return match.group(1).upper()
    return ""


def extract_set_code_from_card_number(card_number):
    normalized = normalize_source_card_id(card_number)
    match = re.match(r"^([A-Z]+(?:-\d+|\d+)?(?:-\d+)?)", normalized)
    return match.group(1).upper() if match else ""


def should_include_category(option):
    if CATEGORY_ID_FILTER and option["id"].upper() not in CATEGORY_ID_FILTER:
        return False

    if SET_CODE_FILTER:
        category_code = option["set_code"] or extract_set_code_from_card_number(option["label"])
        if category_code.upper() not in SET_CODE_FILTER:
            return False

    return True


def build_category_filter_description():
    parts = []
    if SET_CODE_FILTER:
        parts.append(f"sets={', '.join(sorted(SET_CODE_FILTER))}")
    if CATEGORY_ID_FILTER:
        parts.append(f"categories={', '.join(sorted(CATEGORY_ID_FILTER))}")
    return ", ".join(parts) if parts else "all categories"


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


def extract_category_options(landing_html):
    soup = BeautifulSoup(landing_html, "html.parser")
    category_select = soup.select_one("select[name='category']")
    if not category_select:
        raise ValueError("No se encontro el selector de categorias de Digimon.")

    options = []
    for option in category_select.find_all("option"):
        category_id = clean_text(option.get("value"))
        label = clean_text(option.get_text(" ", strip=True))
        if not category_id or not label or label.lower() == "version":
            continue

        options.append(
            {
                "id": category_id,
                "label": label,
                "set_code": extract_set_code(label),
            }
        )

    return options


def extract_color_value(node):
    if node is None:
        return ""

    color_labels = [
        clean_text(span.get_text(" ", strip=True))
        for span in node.select("span")
        if clean_text(span.get_text(" ", strip=True))
    ]
    if color_labels:
        deduplicated = []
        for color in color_labels:
            if color not in deduplicated:
                deduplicated.append(color)
        return " / ".join(deduplicated)

    return clean_text(node.get_text(" ", strip=True))


def parse_fact_boxes(popup):
    info_col = popup.select_one(".cardInfoCol")
    if not info_col:
        return {}

    facts = {}
    for child in info_col.find_all(recursive=False):
        classes = child.get("class") or []
        if "cardInfoBox" not in classes:
            continue

        if child.name == "dl":
            label_node = child.find("dt", class_="cardInfoTit")
            value_node = child.find("dd", class_="cardInfoData")
            label = clean_text(label_node.get_text(" ", strip=True)) if label_node else ""
            if not label or value_node is None:
                continue
            value = extract_color_value(value_node) if label == "Color" else clean_multiline_text(
                value_node.decode_contents()
            )
            facts[label] = value
            continue

        for sub_box in child.find_all("dl", class_="cardInfoBoxSmall", recursive=False):
            label_node = sub_box.find("dt", class_="cardInfoTitSmall")
            value_node = sub_box.find("dd", class_="cardInfoData")
            label = clean_text(label_node.get_text(" ", strip=True)) if label_node else ""
            if not label or value_node is None:
                continue
            facts[label] = clean_multiline_text(value_node.decode_contents())

    return facts


def parse_card_qa(popup):
    qa_entries = []

    for qa_item in popup.select(".cardFaqListItem"):
        question_number = clean_text(qa_item.select_one(".cardFaqNum").get_text(" ", strip=True)) if qa_item.select_one(".cardFaqNum") else ""
        question_date = clean_text(qa_item.select_one(".cardFaqDate").get_text(" ", strip=True)) if qa_item.select_one(".cardFaqDate") else ""
        question_text = clean_multiline_text(
            qa_item.select_one(".cardFaqQuestion").decode_contents()
        ) if qa_item.select_one(".cardFaqQuestion") else ""
        answer_text = clean_multiline_text(
            qa_item.select_one(".cardFaqAnswer").decode_contents()
        ) if qa_item.select_one(".cardFaqAnswer") else ""

        entry_lines = [part for part in [question_number, question_date, question_text, answer_text] if part]
        if entry_lines:
            qa_entries.append("\n".join(entry_lines))

    return "\n\n".join(qa_entries)


def build_card_abilities(effect_text, inherited_effect, security_effect, rule_text, special_digivolution):
    blocks = []
    if effect_text:
        blocks.append(effect_text)
    if inherited_effect:
        blocks.append(f"[Inherited Effect]\n{inherited_effect}")
    if security_effect:
        blocks.append(f"[Security Effect]\n{security_effect}")
    if rule_text:
        blocks.append(f"[Rule]\n{rule_text}")
    if special_digivolution:
        blocks.append(f"[Special Digivolution Condition]\n{special_digivolution}")
    return "\n\n".join(block for block in blocks if block)


def build_card_description(set_name, notes):
    parts = []
    if set_name:
        parts.append(f"Set: {set_name}")
    if notes:
        parts.append(f"Notes: {notes}")
    return "\n".join(parts)


def validate_string_lengths(card_data):
    problems = []

    for field, limit in CARD_STRING_LIMITS.items():
        value = card_data.get(field)
        if isinstance(value, str) and len(value) > limit:
            problems.append(f"{field}={len(value)}/{limit}")

    detail_payload = card_data.get("detail_payload") or {}
    for field, limit in DIGIMON_DETAIL_STRING_LIMITS.items():
        value = detail_payload.get(field)
        if isinstance(value, str) and len(value) > limit:
            problems.append(f"detail_payload.{field}={len(value)}/{limit}")

    if problems:
        source_card_id = card_data.get("source_card_id") or "unknown card"
        name = card_data.get("name") or ""
        raise ValueError(
            f"Digimon card {source_card_id} has values longer than the database schema allows: "
            f"{', '.join(problems)}. Name: {name}"
        )


def parse_popup_card(popup, category_label, page_url):
    popup_id = normalize_source_card_id(popup.get("id"))
    card_number = normalize_source_card_id(
        popup.select_one(".cardNo").get_text(" ", strip=True) if popup.select_one(".cardNo") else popup_id
    )
    card_type = clean_text(popup.select_one(".cardType").get_text(" ", strip=True) if popup.select_one(".cardType") else "")
    rarity = clean_text(popup.select_one(".cardRarity").get_text(" ", strip=True) if popup.select_one(".cardRarity") else "")
    level_label = clean_text(popup.select_one(".cardLv").get_text(" ", strip=True) if popup.select_one(".cardLv") else "")
    name = clean_text(popup.select_one(".cardTitle").get_text(" ", strip=True) if popup.select_one(".cardTitle") else card_number)
    is_alternative_art = popup.select_one(".cardParallel") is not None

    image_node = popup.select_one(".cardImg img")
    image_url = urljoin(page_url, image_node.get("src")) if image_node and image_node.get("src") else ""
    set_name = clean_text(category_label)
    version = extract_set_code(category_label) or extract_set_code_from_card_number(card_number)
    source_card_id = popup_id or card_number
    deck_key = card_number

    facts = parse_fact_boxes(popup)
    color = facts.get("Color", "")
    form = facts.get("Form", "")
    attribute = facts.get("Attribute", "")
    type_line = facts.get("Type", "")
    notes = facts.get("Notes", "")
    effect_text = facts.get("[Effect]", "")
    inherited_effect = facts.get("[Inherited Effect]", "")
    security_effect = facts.get("[Security Effect]", "")
    rule_text = facts.get("[Rule]", "")
    special_digivolution = facts.get("[Special Digivolution Condition]", "")
    digivolution_requirements = "\n".join(
        f"{label}: {value}"
        for label, value in facts.items()
        if label.startswith("Digivolve Cost")
    )
    qa = parse_card_qa(popup)

    return {
        "source_card_id": source_card_id,
        "deck_key": deck_key,
        "name": name,
        "card_type": card_type or "Digimon",
        "lv": to_int(level_label),
        "cost": to_int(facts.get("Cost")),
        "ap": None,
        "hp": None,
        "color": color,
        "rarity": rarity,
        "set_name": set_name,
        "version": version,
        "block": None,
        "traits": type_line,
        "link": "",
        "zones": "",
        "artist": "",
        "abilities": build_card_abilities(
            effect_text,
            inherited_effect,
            security_effect,
            rule_text,
            special_digivolution,
        ),
        "description": build_card_description(set_name, notes),
        "image_url": image_url,
        "detail_payload": {
            "dp": to_int(facts.get("DP")),
            "form": form,
            "attribute": attribute,
            "type_line": type_line,
            "digivolution_requirements": digivolution_requirements,
            "special_digivolution": special_digivolution,
            "inherited_effect": inherited_effect,
            "security_effect": security_effect,
            "rule_text": rule_text,
            "notes": notes,
            "qa": qa,
            "is_alternative_art": is_alternative_art,
        },
    }


def score_card_data(card_data):
    score = 0
    for key in (
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

    for key in ("lv", "cost"):
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

    for key in ("lv", "cost"):
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


def scrape_digimon_cards():
    session = build_session()
    scraped_cards = []
    failed_categories = []

    try:
        landing_html, _landing_url = fetch_html_with_retry(session, CARDLIST_URL)
        category_options = [
            option for option in extract_category_options(landing_html)
            if should_include_category(option)
        ]

        for category in category_options:
            try:
                category_html, page_url = fetch_html_with_retry(
                    session,
                    CARDLIST_URL,
                    params={"search": "true", "category": category["id"]},
                )
            except Exception as exc:  # pragma: no cover - network retry guard
                failed_categories.append(category["label"])
                print(f"Error fetching {category['label']}: {exc}")
                continue

            soup = BeautifulSoup(category_html, "html.parser")
            popup_cards = soup.select("li.image_lists_item.data > div.popupCol")
            included_cards = []

            for popup in popup_cards:
                card_data = parse_popup_card(popup, category["label"], page_url)
                if card_data["detail_payload"].get("is_alternative_art") and not INCLUDE_ALTERNATIVE_ART:
                    continue
                included_cards.append(card_data)
                print(
                    f"{card_data['source_card_id']} -> {card_data['name']} | "
                    f"{card_data['color'] or ''} | type={card_data['card_type']} | cost={card_data['cost']}"
                )

            scraped_cards.extend(included_cards)
            print(
                f"Category {category['label']} processed | "
                f"Cards found: {len(popup_cards)} | Included: {len(included_cards)}"
            )

        deduplicated_cards, duplicate_count = deduplicate_cards(scraped_cards)
        deduplicated_cards.sort(key=lambda item: (item["version"], item["deck_key"], item["source_card_id"]))
        failed_categories.sort()
        print(
            f"Finished Digimon scrape | Filter: {build_category_filter_description()} | "
            f"Collected: {len(deduplicated_cards)} | Deduplicated repeats: {duplicate_count}"
        )
        return deduplicated_cards, failed_categories, duplicate_count
    finally:
        session.close()


def ensure_tgc(db):
    tgc = db.query(Tgc).filter(Tgc.name == DIGIMON_TCG_NAME).first()
    if tgc:
        return tgc

    tgc = Tgc(name=DIGIMON_TCG_NAME, description="Digimon Card Game")
    db.add(tgc)
    db.commit()
    db.refresh(tgc)
    return tgc


def should_prune_stale_cards():
    return POPULATE_PRUNE_STALE and not HAS_ACTIVE_FILTERS


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
        db.query(DigimonCard).filter(DigimonCard.card_id.in_(deletable_ids)).delete(synchronize_session=False)
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
        (clean_text(card.source_card_id), clean_text(card.version).upper()): card
        for card in existing_cards
        if clean_text(card.source_card_id) and clean_text(card.version)
    }
    detail_map = {
        detail.card_id: detail
        for detail in db.query(DigimonCard)
        .join(Card, Card.id == DigimonCard.card_id)
        .filter(Card.tgc_id == tgc_id)
        .all()
    }

    inserted = 0
    updated = 0
    imported_keys = set()

    for card_data in scraped_cards:
        validate_string_lengths(card_data)

        identity = (clean_text(card_data["source_card_id"]), clean_text(card_data["version"]).upper())
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
            detail = DigimonCard(card_id=card.id)
            db.add(detail)
            detail_map[card.id] = detail

        detail.dp = detail_payload.get("dp")
        detail.form = detail_payload.get("form", "")
        detail.attribute = detail_payload.get("attribute", "")
        detail.type_line = detail_payload.get("type_line", "")
        detail.digivolution_requirements = detail_payload.get("digivolution_requirements", "")
        detail.special_digivolution = detail_payload.get("special_digivolution", "")
        detail.inherited_effect = detail_payload.get("inherited_effect", "")
        detail.security_effect = detail_payload.get("security_effect", "")
        detail.rule_text = detail_payload.get("rule_text", "")
        detail.notes = detail_payload.get("notes", "")
        detail.qa = detail_payload.get("qa", "")
        detail.is_alternative_art = bool(detail_payload.get("is_alternative_art"))

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
        and (clean_text(card.source_card_id), clean_text(card.version).upper()) not in imported_keys
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
    if POPULATE_PRUNE_STALE and HAS_ACTIVE_FILTERS:
        raise ValueError(
            "Refusing to prune stale Digimon cards during a filtered import. "
            "Disable POPULATE_PRUNE_STALE or run a full import first."
        )

    init_db()
    db = SessionLocal()

    try:
        print(f"Database target: {POPULATE_DATABASE_TARGET}")
        print(f"Category filter: {build_category_filter_description()}")
        print(f"Include alternative art: {INCLUDE_ALTERNATIVE_ART}")

        tgc = ensure_tgc(db)
        scraped_cards, failed_categories, duplicate_count = scrape_digimon_cards()
        result = upsert_cards(db, tgc.id, scraped_cards)

        print("")
        print("Populate summary")
        print(f"- TCG: {DIGIMON_TCG_NAME}")
        print(f"- Inserted: {result['inserted']}")
        print(f"- Updated: {result['updated']}")
        print(f"- Existing not seen in this run: {result['stale']}")
        print(f"- Pruned stale unreferenced cards: {result['pruned']}")
        print(f"- Skipped referenced stale cards: {result['skipped_referenced']}")
        print(f"- Deduplicated exact repeats: {duplicate_count}")
        print(f"- Failed categories: {len(failed_categories)}")

        if failed_categories:
            print("- Failed category labels:")
            for label in failed_categories:
                print(f"  {label}")

        print("")
        if should_prune_stale_cards():
            print("Referenced collection and deck cards were preserved. Only stale unreferenced Digimon cards were deleted.")
        else:
            print("User collections and decks were preserved because stale cards were not deleted.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
