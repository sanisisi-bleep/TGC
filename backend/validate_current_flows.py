import os
import subprocess
import sys
import time
from pathlib import Path

import requests
from sqlalchemy import delete
from sqlalchemy.exc import OperationalError
from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.database.connection import SessionLocal
from app.models import Card, Deck, DeckCard, DeckConsideringCard, DeckEggCard, User, UserCollection
from app.services.game_rules import (
    DIGIMON_TCG_NAME,
    GUNDAM_TGC_NAME,
    ONE_PIECE_TCG_NAME,
    get_digimon_card_role,
    get_gundam_colors,
    get_one_piece_card_role,
    get_one_piece_colors,
)

PASSWORD = "SmokePass123!"
PORT = int(os.getenv("SMOKE_PORT", "8010"))
BASE_URL = f"http://127.0.0.1:{PORT}"
REQUEST_TIMEOUT = int(os.getenv("SMOKE_REQUEST_TIMEOUT", "30"))
STOP_AFTER = (os.getenv("SMOKE_STOP_AFTER") or "").strip().lower()


def expect(condition, message):
    if not condition:
        raise AssertionError(message)


def expect_status(response, status_code, message):
    expect(
        response.status_code == status_code,
        f"{message}. status={response.status_code} body={response.text}",
    )


def should_stop_after(step: str) -> bool:
    return STOP_AFTER == step.strip().lower()


def request(session: requests.Session, method: str, path: str, **kwargs):
    kwargs.setdefault("timeout", REQUEST_TIMEOUT)
    return session.request(method, f"{BASE_URL}{path}", **kwargs)


def cleanup_user(username: str):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            return

        owned_deck_ids = [deck_id for (deck_id,) in db.query(Deck.id).filter(Deck.user_id == user.id).all()]
        if owned_deck_ids:
            db.execute(delete(DeckCard).where(DeckCard.deck_id.in_(owned_deck_ids)))
            db.execute(delete(DeckEggCard).where(DeckEggCard.deck_id.in_(owned_deck_ids)))
            db.execute(delete(DeckConsideringCard).where(DeckConsideringCard.deck_id.in_(owned_deck_ids)))
            db.execute(delete(Deck).where(Deck.id.in_(owned_deck_ids)))

        db.execute(delete(UserCollection).where(UserCollection.user_id == user.id))
        db.execute(delete(User).where(User.id == user.id))
        db.commit()
    finally:
        db.close()


def ensure_database_reachable():
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
    finally:
        db.close()


def start_server():
    env = os.environ.copy()
    env.setdefault("INIT_DB_ON_STARTUP", "false")
    env.setdefault("HEALTHCHECK_DATABASE", "true")
    env.setdefault("SHOW_HEALTH_ERRORS", "true")
    env["PYTHONUNBUFFERED"] = "1"

    return subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(PORT),
            "--log-level",
            "warning",
        ],
        cwd=str(ROOT_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )


def stop_server(process: subprocess.Popen):
    if process.poll() is not None:
        return

    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def collect_server_output(process: subprocess.Popen, limit: int = 6000):
    if process.stdout is None:
        return ""
    try:
        output = process.stdout.read() or ""
    except Exception:
        return ""
    return output[-limit:]


def wait_for_server(process: subprocess.Popen):
    last_error = None
    for _ in range(60):
        if process.poll() is not None:
            server_output = collect_server_output(process)
            raise RuntimeError(f"Smoke server exited before startup.\n{server_output}")

        try:
            response = requests.get(f"{BASE_URL}/health", timeout=2)
            if response.status_code in {200, 503}:
                return
        except Exception as error:
            last_error = error

        time.sleep(1)

    server_output = collect_server_output(process)
    raise RuntimeError(f"Smoke server did not become ready. last_error={last_error}\n{server_output}")


def pick_one_piece_cards(db, tgc_id):
    leader = None
    leader_colors = []
    for card in db.query(Card).filter(Card.tgc_id == tgc_id).order_by(Card.id.asc()).all():
        if get_one_piece_card_role(card.card_type) != "leader":
            continue
        colors = get_one_piece_colors(card.color)
        if colors:
            leader = card
            leader_colors = colors
            break

    expect(leader is not None, "Need a One Piece leader with detectable colors")

    same_color_main = None
    off_color_main = None
    don_card = None

    for card in db.query(Card).filter(Card.tgc_id == tgc_id).order_by(Card.id.asc()).all():
        role = get_one_piece_card_role(card.card_type)
        colors = get_one_piece_colors(card.color)
        if role == "don" and don_card is None:
            don_card = card
        elif role == "main":
            if same_color_main is None and any(color in leader_colors for color in colors):
                same_color_main = card
            if off_color_main is None and colors and all(color not in leader_colors for color in colors):
                off_color_main = card
        if same_color_main and off_color_main and don_card:
            break

    expect(same_color_main is not None, "Need a One Piece main-deck card matching leader color")
    expect(off_color_main is not None, "Need a One Piece off-color main-deck card")
    expect(don_card is not None, "Need a One Piece DON card")

    return leader, same_color_main, off_color_main, don_card


def pick_gundam_cards(db, tgc_id):
    by_color = {}
    for card in db.query(Card).filter(Card.tgc_id == tgc_id).order_by(Card.id.asc()).all():
        colors = get_gundam_colors(card.color)
        if len(colors) != 1:
            continue
        color = colors[0]
        by_color.setdefault(color, card)
        if len(by_color) >= 3:
            break

    expect(len(by_color) >= 3, "Need three single-color Gundam cards")
    picked = list(by_color.values())[:3]
    return picked[0], picked[1], picked[2]


def pick_digimon_cards(db, tgc_id):
    egg = None
    main = None

    for card in db.query(Card).filter(Card.tgc_id == tgc_id).order_by(Card.id.asc()).all():
        role = get_digimon_card_role(card.card_type)
        if role == "egg" and egg is None:
            egg = card
        elif role == "main" and main is None:
            main = card
        if egg and main:
            break

    expect(egg is not None, "Need a Digimon egg card")
    expect(main is not None, "Need a Digimon main-deck card")
    return egg, main


def create_deck(session: requests.Session, name: str, tgc_id: int):
    response = request(session, "POST", "/decks", json={"name": name, "tgc_id": tgc_id})
    expect_status(response, 200, f"Creating deck {name} must work")
    payload = response.json()
    expect(payload.get("id"), f"Deck {name} response must include id")
    return payload


def get_tgc_ids(session: requests.Session):
    response = request(session, "GET", "/tgc")
    expect_status(response, 200, "GET /tgc must work")
    tgcs = response.json()
    mapping = {item["name"]: item["id"] for item in tgcs}
    expect(ONE_PIECE_TCG_NAME in mapping, "One Piece TCG must exist in catalog")
    expect(GUNDAM_TGC_NAME in mapping, "Gundam TGC must exist in catalog")
    expect(DIGIMON_TCG_NAME in mapping, "Digimon Card Game must exist in catalog")
    return mapping


def assert_catalog_endpoints(session: requests.Session, tgc_ids: dict[str, int]):
    root_response = request(session, "GET", "/")
    expect_status(root_response, 200, "GET / must work")

    health_response = request(session, "GET", "/health")
    expect(health_response.status_code in {200, 503}, "GET /health must answer")

    for tcg_name, tgc_id in tgc_ids.items():
        cards_response = request(
            session,
            "GET",
            "/cards",
            params={"tgc_id": tgc_id, "page": 1, "limit": 5},
        )
        expect_status(cards_response, 200, f"GET /cards must work for {tcg_name}")
        cards_payload = cards_response.json()
        expect(cards_payload["items"], f"{tcg_name} should return cards")

        facets_response = request(session, "GET", "/cards/facets", params={"tgc_id": tgc_id})
        expect_status(facets_response, 200, f"GET /cards/facets must work for {tcg_name}")

        first_card_id = cards_payload["items"][0]["id"]
        detail_response = request(session, "GET", f"/cards/{first_card_id}")
        expect_status(detail_response, 200, f"GET /cards/{first_card_id} must work")


def assert_one_piece_flow(session: requests.Session, db, tgc_id: int):
    leader, same_color_main, off_color_main, don_card = pick_one_piece_cards(db, tgc_id)
    deck = create_deck(session, "Smoke OP", tgc_id)
    deck_id = deck["id"]

    options_response = request(session, "GET", "/decks/options", params={"tgc_id": tgc_id})
    expect_status(options_response, 200, "GET /decks/options for One Piece must work")

    search_options = request(session, "GET", "/decks/search-options", params={"tgc_id": tgc_id})
    expect_status(search_options, 200, "GET /decks/search-options for One Piece must work")
    option = next(item for item in search_options.json() if item["id"] == deck_id)
    expect(option["leader_cards"] == 0, "New One Piece deck should start without leader")

    forbidden_main = request(
        session,
        "POST",
        f"/decks/{deck_id}/cards",
        json={"card_id": same_color_main.id, "quantity": 1},
    )
    expect(forbidden_main.status_code == 400, "One Piece main card before leader must be rejected")

    leader_add = request(
        session,
        "POST",
        f"/decks/{deck_id}/cards",
        json={"card_id": leader.id, "quantity": 1},
    )
    expect_status(leader_add, 200, "Adding One Piece leader must work")

    updated_search_options = request(session, "GET", "/decks/search-options", params={"tgc_id": tgc_id})
    expect_status(updated_search_options, 200, "Refreshing One Piece search options must work")
    updated_option = next(item for item in updated_search_options.json() if item["id"] == deck_id)
    expect(updated_option["leader_cards"] == 1, "One Piece search options must reflect leader insertion")

    same_color_add = request(
        session,
        "POST",
        f"/decks/{deck_id}/cards",
        json={"card_id": same_color_main.id, "quantity": 1},
    )
    expect_status(same_color_add, 200, "Adding One Piece in-color main card must work")

    off_color_add = request(
        session,
        "POST",
        f"/decks/{deck_id}/cards",
        json={"card_id": off_color_main.id, "quantity": 1},
    )
    expect(off_color_add.status_code == 400, "Adding One Piece off-color main card must be rejected")

    don_add = request(
        session,
        "POST",
        f"/decks/{deck_id}/cards",
        json={"card_id": don_card.id, "quantity": 1},
    )
    expect_status(don_add, 200, "Adding One Piece DON card must work")

    detail_response = request(session, "GET", f"/decks/{deck_id}")
    expect_status(detail_response, 200, "Fetching One Piece deck detail must work")

    share_response = request(session, "POST", f"/decks/{deck_id}/share")
    expect_status(share_response, 200, "Sharing One Piece deck must work")
    share_token = share_response.json()["share_token"]
    shared_deck_response = request(session, "GET", f"/decks/shared/{share_token}")
    expect_status(shared_deck_response, 200, "Shared One Piece deck must be accessible")

    return {
        "deck_id": deck_id,
        "leader": leader,
        "same_color_main": same_color_main,
    }


def assert_gundam_flow(session: requests.Session, db, tgc_id: int):
    first_card, second_card, third_card = pick_gundam_cards(db, tgc_id)
    deck = create_deck(session, "Smoke Gundam", tgc_id)
    deck_id = deck["id"]

    first_add = request(
        session,
        "POST",
        f"/decks/{deck_id}/cards",
        json={"card_id": first_card.id, "quantity": 1},
    )
    expect_status(first_add, 200, "Adding first Gundam card must work")

    second_add = request(
        session,
        "POST",
        f"/decks/{deck_id}/cards",
        json={"card_id": second_card.id, "quantity": 1},
    )
    expect_status(second_add, 200, "Adding second Gundam color must work")

    third_add = request(
        session,
        "POST",
        f"/decks/{deck_id}/cards",
        json={"card_id": third_card.id, "quantity": 1},
    )
    expect(third_add.status_code == 400, "Adding third Gundam color must be rejected")

    considering_add = request(
        session,
        "POST",
        f"/decks/{deck_id}/considering",
        json={"card_id": third_card.id, "quantity": 1},
    )
    expect_status(considering_add, 200, "Adding Gundam card to considering must work")

    move_to_deck = request(
        session,
        "POST",
        f"/decks/{deck_id}/considering/{third_card.id}/move-to-main",
        json={"quantity": 1},
    )
    expect(move_to_deck.status_code == 400, "Moving third Gundam color from considering to deck must be rejected")

    return {
        "deck_id": deck_id,
        "first_card": first_card,
    }


def assert_digimon_flow(session: requests.Session, db, tgc_id: int):
    egg_card, main_card = pick_digimon_cards(db, tgc_id)
    deck = create_deck(session, "Smoke Digimon", tgc_id)
    deck_id = deck["id"]

    egg_add = request(
        session,
        "POST",
        f"/decks/{deck_id}/cards",
        json={"card_id": egg_card.id, "quantity": 1},
    )
    expect_status(egg_add, 200, "Adding first Digimon egg must work")
    expect(egg_add.json().get("deck_section") == "egg", "Digimon egg must be routed to egg section")

    extra_egg_add = request(
        session,
        "POST",
        f"/decks/{deck_id}/cards",
        json={"card_id": egg_card.id, "quantity": 4},
    )
    expect_status(extra_egg_add, 200, "Adding Digimon eggs up to 5 must work")

    overflow_egg_add = request(
        session,
        "POST",
        f"/decks/{deck_id}/cards",
        json={"card_id": egg_card.id, "quantity": 1},
    )
    expect(overflow_egg_add.status_code == 400, "Adding sixth Digimon egg must be rejected")

    main_add = request(
        session,
        "POST",
        f"/decks/{deck_id}/cards",
        json={"card_id": main_card.id, "quantity": 1},
    )
    expect_status(main_add, 200, "Adding Digimon main card must work")
    expect(main_add.json().get("deck_section") == "main", "Digimon main card must stay in main section")


def assert_collection_and_settings_flow(session: requests.Session, one_piece_flow: dict, gundam_flow: dict, tgc_ids: dict[str, int]):
    leader = one_piece_flow["leader"]
    gundam_card = gundam_flow["first_card"]

    op_collection_add = request(session, "POST", "/collection", json={"card_id": leader.id, "quantity": 4})
    expect_status(op_collection_add, 200, "Adding One Piece leader to collection must work")

    gundam_collection_add = request(session, "POST", "/collection", json={"card_id": gundam_card.id, "quantity": 4})
    expect_status(gundam_collection_add, 200, "Adding Gundam card to collection must work")

    op_collection = request(
        session,
        "GET",
        "/collection",
        params={"tgc_id": tgc_ids[ONE_PIECE_TCG_NAME]},
    )
    expect_status(op_collection, 200, "Fetching One Piece collection must work")
    leader_entry = next(item for item in op_collection.json() if item["card"]["id"] == leader.id)
    expect(leader_entry["available_quantity"] == 3, "One Piece collection availability must discount deck usage")

    settings_get = request(session, "GET", "/settings/me")
    expect_status(settings_get, 200, "Fetching settings must work")

    settings_update = request(session, "PATCH", "/settings/me", json={"advanced_mode": True})
    expect_status(settings_update, 200, "Enabling advanced mode must work")
    expect(settings_update.json()["advanced_mode"] is True, "Advanced mode must remain enabled")

    gundam_collection = request(
        session,
        "GET",
        "/collection",
        params={"tgc_id": tgc_ids[GUNDAM_TCG_NAME]},
    )
    expect_status(gundam_collection, 200, "Fetching Gundam collection must work")
    gundam_entry = next(item for item in gundam_collection.json() if item["card"]["id"] == gundam_card.id)
    expect(gundam_entry["available_quantity"] == 3, "Assigned Gundam copy must reduce available quantity")

    assignment_down = request(
        session,
        "POST",
        f"/decks/{gundam_flow['deck_id']}/cards/{gundam_card.id}/assignment",
        json={"delta": -1},
    )
    expect_status(assignment_down, 200, "Lowering assignment in advanced mode must work")

    gundam_collection_after_release = request(
        session,
        "GET",
        "/collection",
        params={"tgc_id": tgc_ids[GUNDAM_TCG_NAME]},
    )
    expect_status(gundam_collection_after_release, 200, "Fetching Gundam collection after assignment release must work")
    gundam_entry_after_release = next(
        item for item in gundam_collection_after_release.json() if item["card"]["id"] == gundam_card.id
    )
    expect(
        gundam_entry_after_release["available_quantity"] == 4,
        "Advanced mode must free assigned Gundam copies in collection",
    )

    assignment_up = request(
        session,
        "POST",
        f"/decks/{gundam_flow['deck_id']}/cards/{gundam_card.id}/assignment",
        json={"delta": 1},
    )
    expect_status(assignment_up, 200, "Restoring assignment in advanced mode must work")

    remove_card = request(
        session,
        "POST",
        f"/decks/{gundam_flow['deck_id']}/cards/{gundam_card.id}/adjust",
        json={"delta": -1},
    )
    expect_status(remove_card, 200, "Removing Gundam card from deck must work")

    gundam_collection_after_remove = request(
        session,
        "GET",
        "/collection",
        params={"tgc_id": tgc_ids[GUNDAM_TCG_NAME]},
    )
    expect_status(gundam_collection_after_remove, 200, "Fetching Gundam collection after deck removal must work")
    gundam_entry_after_remove = next(
        item for item in gundam_collection_after_remove.json() if item["card"]["id"] == gundam_card.id
    )
    expect(
        gundam_entry_after_remove["available_quantity"] == 4,
        "Removing Gundam card from deck must free the collection copy",
    )

    add_back_card = request(
        session,
        "POST",
        f"/decks/{gundam_flow['deck_id']}/cards",
        json={"card_id": gundam_card.id, "quantity": 1},
    )
    expect_status(add_back_card, 200, "Adding Gundam card back to deck must work")

    gundam_collection_after_restore = request(
        session,
        "GET",
        "/collection",
        params={"tgc_id": tgc_ids[GUNDAM_TCG_NAME]},
    )
    expect_status(gundam_collection_after_restore, 200, "Fetching Gundam collection after deck restore must work")
    gundam_entry_after_restore = next(
        item for item in gundam_collection_after_restore.json() if item["card"]["id"] == gundam_card.id
    )
    expect(
        gundam_entry_after_restore["available_quantity"] == 3,
        "Adding Gundam card back to deck must consume the collection copy again",
    )


def main():
    timestamp = int(time.time())
    username = f"smoke_{timestamp}"
    email = f"{username}@example.com"

    try:
        ensure_database_reachable()
    except OperationalError as error:
        raise RuntimeError(f"DATABASE_UNAVAILABLE: {error}") from error

    cleanup_user(username)
    process = start_server()
    db = SessionLocal()

    try:
        wait_for_server(process)
        session = requests.Session()

        print("STEP auth.register")
        register_response = request(
            session,
            "POST",
            "/auth/register",
            json={"username": username, "email": email, "password": PASSWORD},
        )
        expect_status(register_response, 200, "Registering temporary user must work")

        print("STEP auth.login")
        login_response = request(
            session,
            "POST",
            "/auth/token",
            json={"username": username, "password": PASSWORD},
        )
        expect_status(login_response, 200, "Logging in temporary user must work")

        print("STEP auth.session")
        session_response = request(session, "GET", "/auth/session")
        expect_status(session_response, 200, "Fetching session must work")
        expect(session_response.json()["authenticated"] is True, "Session must be authenticated after login")
        if should_stop_after("auth"):
            print("VALIDATION_OK")
            return

        print("STEP decks.initial")
        decks_before = request(session, "GET", "/decks")
        expect_status(decks_before, 200, "Fetching decks must work right after login")

        print("STEP catalog")
        tgc_ids = get_tgc_ids(session)
        assert_catalog_endpoints(session, tgc_ids)
        if should_stop_after("catalog"):
            print("VALIDATION_OK")
            return

        print("STEP one_piece")
        one_piece_flow = assert_one_piece_flow(session, db, tgc_ids[ONE_PIECE_TCG_NAME])
        if should_stop_after("one_piece"):
            print("VALIDATION_OK")
            return
        print("STEP gundam")
        gundam_flow = assert_gundam_flow(session, db, tgc_ids[GUNDAM_TCG_NAME])
        if should_stop_after("gundam"):
            print("VALIDATION_OK")
            return
        print("STEP digimon")
        assert_digimon_flow(session, db, tgc_ids[DIGIMON_TCG_NAME])
        if should_stop_after("digimon"):
            print("VALIDATION_OK")
            return
        print("STEP collection.settings")
        assert_collection_and_settings_flow(session, one_piece_flow, gundam_flow, tgc_ids)
        if should_stop_after("collection"):
            print("VALIDATION_OK")
            return

        print("STEP auth.logout")
        logout_response = request(session, "POST", "/auth/logout")
        expect_status(logout_response, 200, "Logout must work")
        session_after_logout = request(session, "GET", "/auth/session")
        expect_status(session_after_logout, 200, "Fetching session after logout must work")
        expect(session_after_logout.json()["authenticated"] is False, "Session must be anonymous after logout")

        print("VALIDATION_OK")
    except Exception:
        print("SERVER_OUTPUT_START")
        print(collect_server_output(process))
        print("SERVER_OUTPUT_END")
        raise
    finally:
        db.close()
        stop_server(process)
        cleanup_user(username)


if __name__ == "__main__":
    main()
