import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from dotenv import load_dotenv

from app.database.connection import SessionLocal, engine, init_db
from app.models import Card, Tgc, GundamCard, OnePieceCard
from app.database.repositories.tgc_repository import TgcRepository
from app.services.game_rules import GUNDAM_TGC_NAME, ONE_PIECE_TCG_NAME

load_dotenv()
#one-piece, gundam
TCG_SLUG = os.getenv("TCG_SLUG", "one-piece").strip().lower()
CARD_SET_PREFIX = os.getenv("CARD_SET_PREFIX", "OP01")
CARD_START = int(os.getenv("CARD_START", "1"))
CARD_END = int(os.getenv("CARD_END", "40"))
MAX_WORKERS = int(os.getenv("POPULATE_WORKERS", "5"))
MAX_RETRIES = int(os.getenv("POPULATE_RETRIES", "2"))
REQUEST_TIMEOUT = int(os.getenv("POPULATE_REQUEST_TIMEOUT", "20"))
APITCG_API_KEY = os.getenv(
    "APITCG_API_KEY",
    "069fac02cded932259a2ca204af880222b456ed8ac7e098ce7dfb9b1ed030f0c",
)

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/147.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "x-api-key": APITCG_API_KEY,
}

TCG_CONFIG = {
    "gundam": {
        "name": GUNDAM_TGC_NAME,
        "description": "Gundam Card Game",
        "api_slug": "gundam",
        "default_prefix": "GD01",
        "default_end": 299,
    },
    "one-piece": {
        "name": ONE_PIECE_TCG_NAME,
        "description": "One Piece Card Game",
        "api_slug": "one-piece",
        "default_prefix": "OP01",
        "default_end": 200,
    },
}


def get_active_config():
    config = TCG_CONFIG.get(TCG_SLUG)
    if not config:
        raise ValueError(f"Unsupported TCG slug: {TCG_SLUG}")
    return config


def get_card_ids():
    return [f"{CARD_SET_PREFIX}-{i:03d}" for i in range(CARD_START, CARD_END + 1)]


def clean_text(text):
    if text is None:
        return ""
    return re.sub(r"\s+", " ", str(text)).strip()


def clean_multiline_text(text):
    if not text:
        return ""
    normalized = str(text).replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
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


def to_int(value):
    if value is None or value == "":
        return None
    match = re.search(r"\d+", str(value))
    return int(match.group()) if match else None


def build_session():
    session = requests.Session()
    session.headers.update(REQUEST_HEADERS)
    return session


def ensure_tgc(db, config):
    tgc_repo = TgcRepository(db)
    tgc = db.query(Tgc).filter(Tgc.name == config["name"]).first()

    if tgc:
        return tgc

    return tgc_repo.create(Tgc(name=config["name"], description=config["description"]))


def fetch_card_payload(session, card_id, config):
    url = f"https://www.apitcg.com/api/{config['api_slug']}/cards/{card_id}"
    response = session.get(url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data")

    if not data:
        raise ValueError(f"No card found for {card_id}")
    if clean_text(data.get("code") or data.get("id")) != card_id:
        raise ValueError(f"Unexpected card returned for {card_id}")
    return data


def build_gundam_card_data(api_card):
    code = clean_text(api_card.get("code") or api_card.get("id"))
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
        "image_url": normalize_image_url((api_card.get("images") or {}).get("large") or (api_card.get("images") or {}).get("small")),
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


def build_one_piece_card_data(api_card):
    code = clean_text(api_card.get("code") or api_card.get("id"))
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
        "image_url": normalize_image_url((api_card.get("images") or {}).get("large") or (api_card.get("images") or {}).get("small")),
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


def build_card_data(api_card):
    if TCG_SLUG == "one-piece":
        return build_one_piece_card_data(api_card)
    return build_gundam_card_data(api_card)


def scrape_single_card(card_id, config):
    session = build_session()
    last_error = None

    try:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                api_card = fetch_card_payload(session, card_id, config)
                return build_card_data(api_card), None
            except Exception as exc:
                last_error = exc
                if attempt < MAX_RETRIES:
                    time.sleep(0.4)
        return None, last_error
    finally:
        session.close()


def scrape_cards_multithreaded(card_ids, config):
    if not card_ids:
        return [], []

    workers = max(1, min(MAX_WORKERS, len(card_ids)))
    print(
        f"Processing {len(card_ids)} cards from {CARD_SET_PREFIX} "
        f"for {config['name']} using Api TCG with {workers} workers"
    )

    scraped_cards = []
    failures = []

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(scrape_single_card, card_id, config): card_id
            for card_id in card_ids
        }

        for future in as_completed(futures):
            card_id = futures[future]

            try:
                card_data, error = future.result()
            except Exception as exc:
                failures.append(card_id)
                print(f"Fatal worker error with {card_id}: {exc}")
                continue

            if error is not None or card_data is None:
                failures.append(card_id)
                print(f"Error with {card_id}: {error}")
                continue

            print(
                f"{card_id} -> {card_data['name']} | {card_data['color']} | "
                f"type={card_data['card_type']} | cost={card_data['cost']}"
            )
            scraped_cards.append(card_data)

    scraped_cards.sort(key=lambda item: item["source_card_id"])
    failures.sort()
    return scraped_cards, failures


def upsert_cards(db, tgc_id, scraped_cards):
    existing_cards = (
        db.query(Card.id, Card.source_card_id, Card.image_url, Card.version, Card.name)
        .filter(Card.tgc_id == tgc_id)
        .all()
    )

    existing_by_source = {
        source_card_id: card_id
        for card_id, source_card_id, _, _, _ in existing_cards
        if source_card_id
    }
    existing_by_image = {
        image_url: card_id
        for card_id, _, image_url, _, _ in existing_cards
        if image_url
    }
    existing_by_identity = {
        (version, name): card_id
        for card_id, _, _, version, name in existing_cards
        if version and name
    }

    update_rows = []
    insert_rows = []

    for card_data in scraped_cards:
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

        existing_id = (
            existing_by_source.get(card_data["source_card_id"])
            or existing_by_image.get(card_data["image_url"])
            or existing_by_identity.get((card_data["version"], card_data["name"]))
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

    sync_detail_tables(db, tgc_id, scraped_cards)

    imported_keys = {
        (card["source_card_id"], card["version"], card["name"])
        for card in scraped_cards
    }

    stale_cards = [
        (source_card_id, version, name)
        for _, source_card_id, _, version, name in existing_cards
        if version and name and (source_card_id, version, name) not in imported_keys
    ]

    return {
        "updated": len(update_rows),
        "inserted": len(insert_rows),
        "stale": len(stale_cards),
    }


def sync_detail_tables(db, tgc_id, scraped_cards):
    card_rows = (
        db.query(Card.id, Card.source_card_id)
        .filter(Card.tgc_id == tgc_id)
        .all()
    )
    card_id_by_source = {source_card_id: card_id for card_id, source_card_id in card_rows}

    if TCG_SLUG == "one-piece":
        existing_details = {
            detail.card_id: detail
            for detail in db.query(OnePieceCard).filter(OnePieceCard.card_id.in_(card_id_by_source.values())).all()
        }

        for card_data in scraped_cards:
            card_id = card_id_by_source.get(card_data["source_card_id"])
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
            for detail in db.query(GundamCard).filter(GundamCard.card_id.in_(card_id_by_source.values())).all()
        }

        for card_data in scraped_cards:
            card_id = card_id_by_source.get(card_data["source_card_id"])
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
        tgc = ensure_tgc(db, config)
        card_ids = get_card_ids()
        scraped_cards, failures = scrape_cards_multithreaded(card_ids, config)
        result = upsert_cards(db, tgc.id, scraped_cards)

        print("")
        print("Populate summary")
        print(f"- TCG: {config['name']}")
        print(f"- Inserted: {result['inserted']}")
        print(f"- Updated: {result['updated']}")
        print(f"- Existing not seen in this run: {result['stale']}")
        print(f"- Failed scrapes: {len(failures)}")

        if failures:
          print("- Failed IDs:")
          for card_id in failures:
              print(f"  {card_id}")

        print("")
        print("User collections and decks were preserved because cards were not deleted.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
