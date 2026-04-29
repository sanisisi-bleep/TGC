import base64
import os
import time
from dataclasses import dataclass

import requests

from app.services.game_rules import (
    DIGIMON_TCG_NAME,
    GUNDAM_TGC_NAME,
    ONE_PIECE_TCG_NAME,
    get_digimon_card_role,
    get_gundam_colors,
    get_one_piece_card_role,
    get_one_piece_colors,
)

BASE_URL = (os.getenv("SMOKE_BASE_URL") or "").strip().rstrip("/")
USERNAME = (os.getenv("SMOKE_USERNAME") or "").strip()
PASSWORD = (os.getenv("SMOKE_PASSWORD") or "").strip()
REQUEST_TIMEOUT = int(os.getenv("SMOKE_REQUEST_TIMEOUT", "45"))
TEST_FEEDBACK = (os.getenv("SMOKE_TEST_FEEDBACK") or "false").strip().lower() in {"1", "true", "yes", "on"}

TINY_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZC7sAAAAASUVORK5CYII="
)
ISSUES = []


@dataclass
class CollectionSnapshot:
    tgc_id: int
    total_quantity: int
    available_quantity: int


def expect(condition, message):
    if not condition:
        raise AssertionError(message)


def expect_status(response, status_code, message):
    expect(
        response.status_code == status_code,
        f"{message}. status={response.status_code} body={response.text}",
    )


def request(session: requests.Session, method: str, path: str, **kwargs):
    kwargs.setdefault("timeout", REQUEST_TIMEOUT)
    return session.request(method, f"{BASE_URL}{path}", **kwargs)


def note_issue(message: str):
    ISSUES.append(message)
    print(f"ISSUE {message}")


def require_config():
    expect(BASE_URL, "SMOKE_BASE_URL is required")
    expect(USERNAME, "SMOKE_USERNAME is required")
    expect(PASSWORD, "SMOKE_PASSWORD is required")


def get_tgc_ids(session: requests.Session):
    response = request(session, "GET", "/tgc")
    expect_status(response, 200, "GET /tgc must work")
    tgcs = response.json()
    available = {item["name"]: item["id"] for item in tgcs}
    required_names = (
        ONE_PIECE_TCG_NAME,
        GUNDAM_TGC_NAME,
        DIGIMON_TCG_NAME,
    )
    mapping = {}
    for tcg_name in required_names:
        expect(tcg_name in available, f"{tcg_name} must exist in catalog")
        mapping[tcg_name] = available[tcg_name]
    return mapping


def get_collection(session: requests.Session, tgc_id: int):
    response = request(session, "GET", "/collection", params={"tgc_id": tgc_id})
    expect_status(response, 200, f"Fetching collection for tgc_id={tgc_id} must work")
    return response.json()


def get_collection_entry(collection_items, card_id: int):
    for item in collection_items:
        if item["card"]["id"] == card_id:
            return item
    return None


def snapshot_collection_card(session: requests.Session, tgc_id: int, card_id: int):
    entry = get_collection_entry(get_collection(session, tgc_id), card_id)
    if entry is None:
        return CollectionSnapshot(tgc_id=tgc_id, total_quantity=0, available_quantity=0)
    return CollectionSnapshot(
        tgc_id=tgc_id,
        total_quantity=int(entry["total_quantity"]),
        available_quantity=int(entry["available_quantity"]),
    )


def restore_collection_card(session: requests.Session, card_id: int, snapshot: CollectionSnapshot):
    current_entry = get_collection_entry(get_collection(session, snapshot.tgc_id), card_id)
    current_total = int(current_entry["total_quantity"]) if current_entry else 0
    delta = snapshot.total_quantity - current_total
    if delta == 0:
        return
    if delta > 0:
        response = request(session, "POST", "/collection", json={"card_id": card_id, "quantity": delta})
        expect_status(response, 200, f"Restoring {delta} copies to collection for card {card_id} must work")
        return
    response = request(session, "POST", f"/collection/{card_id}/adjust", json={"delta": delta})
    expect_status(response, 200, f"Removing {-delta} extra copies from collection for card {card_id} must work")


def delete_created_decks(session: requests.Session, deck_ids):
    for deck_id in reversed(deck_ids):
        response = request(session, "DELETE", f"/decks/{deck_id}")
        expect_status(response, 200, f"Deleting temp deck {deck_id} must work")


def list_cards(session: requests.Session, tgc_id: int, page: int = 1, limit: int = 100):
    response = request(
        session,
        "GET",
        "/cards",
        params={"tgc_id": tgc_id, "page": page, "limit": limit, "sort": "collection-asc"},
    )
    expect_status(response, 200, f"GET /cards must work for tgc_id={tgc_id}")
    return response.json()


def iter_card_pages(session: requests.Session, tgc_id: int, page_limit: int = 30):
    for page in range(1, page_limit + 1):
        payload = list_cards(session, tgc_id, page=page)
        items = payload.get("items") or []
        for item in items:
            yield item
        if not payload.get("has_next"):
            break


def pick_one_piece_cards(session: requests.Session, tgc_id: int):
    leader = None
    leader_colors = []
    same_color_main = None
    off_color_main = None
    don_card = None

    for card in iter_card_pages(session, tgc_id):
        role = get_one_piece_card_role(card.get("card_type"))
        colors = get_one_piece_colors(card.get("color"))
        if role == "leader" and leader is None and colors:
            leader = card
            leader_colors = colors
            continue
        if role == "don" and don_card is None:
            don_card = card
            continue
        if role == "main":
            if leader_colors and same_color_main is None and any(color in leader_colors for color in colors):
                same_color_main = card
            if leader_colors and off_color_main is None and colors and all(color not in leader_colors for color in colors):
                off_color_main = card
        if leader and same_color_main and off_color_main and don_card:
            break

    expect(leader is not None, "Need a One Piece leader with detectable colors")
    expect(same_color_main is not None, "Need a One Piece in-color main card")
    expect(off_color_main is not None, "Need a One Piece off-color main card")
    expect(don_card is not None, "Need a One Piece DON card")
    return leader, same_color_main, off_color_main, don_card


def pick_gundam_cards(session: requests.Session, tgc_id: int):
    by_color = {}
    for card in iter_card_pages(session, tgc_id):
        colors = get_gundam_colors(card.get("color"))
        if len(colors) != 1:
            continue
        by_color.setdefault(colors[0], card)
        if len(by_color) >= 3:
            break

    expect(len(by_color) >= 3, "Need three single-color Gundam cards")
    picked = list(by_color.values())[:3]
    return picked[0], picked[1], picked[2]


def pick_digimon_cards(session: requests.Session, tgc_id: int):
    egg_cards = []
    main_card = None
    seen_egg_keys = set()

    for card in iter_card_pages(session, tgc_id):
        role = get_digimon_card_role(card.get("card_type"))
        if role == "egg":
            egg_key = (card.get("deck_key") or card.get("source_card_id") or card.get("id"))
            if egg_key not in seen_egg_keys:
                seen_egg_keys.add(egg_key)
                egg_cards.append(card)
        elif role == "main" and main_card is None:
            main_card = card
        if len(egg_cards) >= 2 and main_card is not None:
            break

    expect(len(egg_cards) >= 2, "Need two Digimon egg cards")
    expect(main_card is not None, "Need a Digimon main card")
    return egg_cards[0], egg_cards[1], main_card


def create_deck(session: requests.Session, name: str, tgc_id: int, created_decks: list[int]):
    response = request(session, "POST", "/decks", json={"name": name, "tgc_id": tgc_id})
    expect_status(response, 200, f"Creating deck {name} must work")
    deck = response.json()
    created_decks.append(deck["id"])
    return deck


def assert_catalog_endpoints(session: requests.Session, tgc_ids: dict[str, int]):
    root_response = request(session, "GET", "/")
    expect_status(root_response, 200, "GET / must work")

    for tcg_name, tgc_id in tgc_ids.items():
        cards_payload = list_cards(session, tgc_id, page=1, limit=5)
        expect(cards_payload["items"], f"{tcg_name} should return cards")

        facets_response = request(session, "GET", "/cards/facets", params={"tgc_id": tgc_id})
        expect_status(facets_response, 200, f"GET /cards/facets must work for {tcg_name}")

        detail_response = request(session, "GET", f"/cards/{cards_payload['items'][0]['id']}")
        expect_status(detail_response, 200, f"GET /cards/{{id}} must work for {tcg_name}")


def assert_one_piece_flow(session: requests.Session, tgc_id: int, created_decks: list[int]):
    leader, same_color_main, off_color_main, don_card = pick_one_piece_cards(session, tgc_id)
    deck = create_deck(session, f"SMOKE-OP-{int(time.time())}", tgc_id, created_decks)
    deck_id = deck["id"]

    search_options = request(session, "GET", "/decks/search-options", params={"tgc_id": tgc_id})
    if search_options.status_code == 200:
        option = next(item for item in search_options.json() if item["id"] == deck_id)
        expect(option["leader_cards"] == 0, "New One Piece deck should start without leader")
    else:
        note_issue(f"/decks/search-options returned {search_options.status_code} during One Piece smoke")

    forbidden_main = request(session, "POST", f"/decks/{deck_id}/cards", json={"card_id": same_color_main["id"], "quantity": 1})
    expect(forbidden_main.status_code == 400, "One Piece main card before leader must be rejected")

    leader_add = request(session, "POST", f"/decks/{deck_id}/cards", json={"card_id": leader["id"], "quantity": 1})
    expect_status(leader_add, 200, "Adding One Piece leader must work")

    updated_search_options = request(session, "GET", "/decks/search-options", params={"tgc_id": tgc_id})
    if updated_search_options.status_code == 200:
        updated_option = next(item for item in updated_search_options.json() if item["id"] == deck_id)
        expect(updated_option["leader_cards"] == 1, "One Piece search options must reflect leader insertion")

    same_color_add = request(session, "POST", f"/decks/{deck_id}/cards", json={"card_id": same_color_main["id"], "quantity": 1})
    expect_status(same_color_add, 200, "Adding One Piece in-color main card must work")

    off_color_add = request(session, "POST", f"/decks/{deck_id}/cards", json={"card_id": off_color_main["id"], "quantity": 1})
    expect(off_color_add.status_code == 400, "Adding One Piece off-color main card must be rejected")

    don_add = request(session, "POST", f"/decks/{deck_id}/cards", json={"card_id": don_card["id"], "quantity": 1})
    expect_status(don_add, 200, "Adding One Piece DON card must work")

    detail_response = request(session, "GET", f"/decks/{deck_id}")
    expect_status(detail_response, 200, "Fetching One Piece deck detail must work")

    share_response = request(session, "POST", f"/decks/{deck_id}/share")
    expect_status(share_response, 200, "Sharing One Piece deck must work")
    shared_deck_response = request(session, "GET", f"/decks/shared/{share_response.json()['share_token']}")
    expect_status(shared_deck_response, 200, "Shared One Piece deck must be accessible")

    return {"deck_id": deck_id, "leader": leader}


def assert_gundam_flow(session: requests.Session, tgc_id: int, created_decks: list[int]):
    first_card, second_card, third_card = pick_gundam_cards(session, tgc_id)
    deck = create_deck(session, f"SMOKE-GD-{int(time.time())}", tgc_id, created_decks)
    deck_id = deck["id"]

    first_add = request(session, "POST", f"/decks/{deck_id}/cards", json={"card_id": first_card["id"], "quantity": 1})
    expect_status(first_add, 200, "Adding first Gundam card must work")

    second_add = request(session, "POST", f"/decks/{deck_id}/cards", json={"card_id": second_card["id"], "quantity": 1})
    expect_status(second_add, 200, "Adding second Gundam color must work")

    third_add = request(session, "POST", f"/decks/{deck_id}/cards", json={"card_id": third_card["id"], "quantity": 1})
    expect(third_add.status_code == 400, "Adding third Gundam color must be rejected")

    considering_add = request(session, "POST", f"/decks/{deck_id}/considering", json={"card_id": third_card["id"], "quantity": 1})
    expect_status(considering_add, 200, "Adding Gundam card to considering must work")

    move_to_main = request(session, "POST", f"/decks/{deck_id}/considering/{third_card['id']}/move-to-main", json={"quantity": 1})
    expect(move_to_main.status_code == 400, "Moving third Gundam color from considering to deck must be rejected")

    return {"deck_id": deck_id, "first_card": first_card}


def assert_digimon_flow(session: requests.Session, tgc_id: int, created_decks: list[int]):
    egg_a, egg_b, main_card = pick_digimon_cards(session, tgc_id)
    deck = create_deck(session, f"SMOKE-DM-{int(time.time())}", tgc_id, created_decks)
    deck_id = deck["id"]

    egg_add = request(session, "POST", f"/decks/{deck_id}/cards", json={"card_id": egg_a["id"], "quantity": 4})
    expect_status(egg_add, 200, "Adding four Digimon eggs of one card must work")
    expect(egg_add.json().get("deck_section") == "egg", "Digimon egg must be routed to egg section")

    fifth_egg = request(session, "POST", f"/decks/{deck_id}/cards", json={"card_id": egg_b["id"], "quantity": 1})
    expect_status(fifth_egg, 200, "Adding a fifth Digimon egg with a different card must work")
    expect(fifth_egg.json().get("deck_section") == "egg", "Second Digimon egg must stay in egg section")

    overflow_egg = request(session, "POST", f"/decks/{deck_id}/cards", json={"card_id": egg_b["id"], "quantity": 1})
    expect(overflow_egg.status_code == 400, "Adding a sixth Digimon egg must be rejected")

    main_add = request(session, "POST", f"/decks/{deck_id}/cards", json={"card_id": main_card["id"], "quantity": 1})
    expect_status(main_add, 200, "Adding Digimon main card must work")
    expect(main_add.json().get("deck_section") == "main", "Digimon main card must stay in main section")


def assert_collection_and_settings_flow(
    session: requests.Session,
    tgc_ids: dict[str, int],
    one_piece_flow: dict,
    gundam_flow: dict,
    collection_snapshots: dict[int, CollectionSnapshot],
):
    leader = one_piece_flow["leader"]
    gundam_card = gundam_flow["first_card"]

    collection_snapshots[leader["id"]] = snapshot_collection_card(session, tgc_ids[ONE_PIECE_TCG_NAME], leader["id"])
    collection_snapshots[gundam_card["id"]] = snapshot_collection_card(session, tgc_ids[GUNDAM_TGC_NAME], gundam_card["id"])

    op_add = request(session, "POST", "/collection", json={"card_id": leader["id"], "quantity": 4})
    expect_status(op_add, 200, "Adding One Piece leader copies to collection must work")

    gundam_add = request(session, "POST", "/collection", json={"card_id": gundam_card["id"], "quantity": 4})
    expect_status(gundam_add, 200, "Adding Gundam copies to collection must work")

    op_collection = get_collection(session, tgc_ids[ONE_PIECE_TCG_NAME])
    op_entry = get_collection_entry(op_collection, leader["id"])
    expect(op_entry is not None, "One Piece leader must appear in collection after add")
    expected_op_available = collection_snapshots[leader["id"]].available_quantity + 3
    expect(
        int(op_entry["available_quantity"]) == expected_op_available,
        f"One Piece available quantity should be {expected_op_available} after add and deck use",
    )

    settings_response = request(session, "GET", "/settings/me")
    expect_status(settings_response, 200, "Fetching settings must work")
    original_profile = settings_response.json()

    update_settings = request(session, "PATCH", "/settings/me", json={"advanced_mode": True})
    expect_status(update_settings, 200, "Enabling advanced mode must work")
    expect(update_settings.json()["advanced_mode"] is True, "Advanced mode must remain enabled")

    gundam_collection = get_collection(session, tgc_ids[GUNDAM_TGC_NAME])
    gundam_entry = get_collection_entry(gundam_collection, gundam_card["id"])
    expect(gundam_entry is not None, "Gundam card must appear in collection after add")
    expected_gundam_available = collection_snapshots[gundam_card["id"]].available_quantity + 3
    expect(
        int(gundam_entry["available_quantity"]) == expected_gundam_available,
        f"Gundam available quantity should be {expected_gundam_available} after add and deck use",
    )

    assignment_down = request(
        session,
        "POST",
        f"/decks/{gundam_flow['deck_id']}/cards/{gundam_card['id']}/assignment",
        json={"delta": -1},
    )
    expect_status(assignment_down, 200, "Lowering assignment in advanced mode must work")

    gundam_collection_released = get_collection(session, tgc_ids[GUNDAM_TGC_NAME])
    gundam_entry_released = get_collection_entry(gundam_collection_released, gundam_card["id"])
    expect(
        int(gundam_entry_released["available_quantity"]) == collection_snapshots[gundam_card["id"]].available_quantity + 4,
        "Releasing one assigned Gundam copy must free one extra available copy",
    )

    assignment_up = request(
        session,
        "POST",
        f"/decks/{gundam_flow['deck_id']}/cards/{gundam_card['id']}/assignment",
        json={"delta": 1},
    )
    expect_status(assignment_up, 200, "Restoring assignment in advanced mode must work")

    remove_card = request(
        session,
        "POST",
        f"/decks/{gundam_flow['deck_id']}/cards/{gundam_card['id']}/adjust",
        json={"delta": -1},
    )
    expect_status(remove_card, 200, "Removing Gundam card from deck must work")

    gundam_collection_removed = get_collection(session, tgc_ids[GUNDAM_TGC_NAME])
    gundam_entry_removed = get_collection_entry(gundam_collection_removed, gundam_card["id"])
    expect(
        int(gundam_entry_removed["available_quantity"]) == collection_snapshots[gundam_card["id"]].available_quantity + 4,
        "Removing the Gundam deck card must free the available copy",
    )

    add_back = request(session, "POST", f"/decks/{gundam_flow['deck_id']}/cards", json={"card_id": gundam_card["id"], "quantity": 1})
    expect_status(add_back, 200, "Adding Gundam card back to deck must work")

    gundam_collection_restored = get_collection(session, tgc_ids[GUNDAM_TGC_NAME])
    gundam_entry_restored = get_collection_entry(gundam_collection_restored, gundam_card["id"])
    expect(
        int(gundam_entry_restored["available_quantity"]) == collection_snapshots[gundam_card["id"]].available_quantity + 3,
        "Adding Gundam card back must consume the available copy again",
    )

    return original_profile


def assert_feedback_flow(session: requests.Session):
    files = {
        "attachment": ("smoke-feedback.png", TINY_PNG_BYTES, "image/png"),
    }
    data = {
        "category": "bug",
        "subject": f"[SMOKE] Feedback attachment {int(time.time())}",
        "message": "Smoke test del buzon con adjunto multimedia de produccion.",
        "allow_contact": "true",
    }
    response = request(session, "POST", "/settings/feedback", data=data, files=files)
    expect_status(response, 200, "Sending smoke feedback with attachment must work")


def restore_settings(session: requests.Session, original_profile: dict | None):
    if not original_profile:
        return
    payload = {
        "display_name": original_profile.get("display_name"),
        "bio": original_profile.get("bio"),
        "advanced_mode": bool(original_profile.get("advanced_mode")),
        "favorite_tgc_id": original_profile.get("favorite_tgc_id"),
        "default_tgc_id": original_profile.get("default_tgc_id"),
    }
    response = request(session, "PATCH", "/settings/me", json=payload)
    expect_status(response, 200, "Restoring original settings must work")


def main():
    require_config()

    session = requests.Session()
    created_decks = []
    collection_snapshots: dict[int, CollectionSnapshot] = {}
    original_profile = None

    try:
        print("STEP auth.login")
        login_response = request(session, "POST", "/auth/token", json={"username": USERNAME, "password": PASSWORD})
        expect_status(login_response, 200, "Login with provided production user must work")

        print("STEP auth.session")
        session_response = request(session, "GET", "/auth/session")
        expect_status(session_response, 200, "Session fetch after login must work")
        expect(session_response.json()["authenticated"] is True, "Session must be authenticated")

        print("STEP decks.initial")
        decks_response = request(session, "GET", "/decks")
        expect_status(decks_response, 200, "Listing decks must work")

        print("STEP catalog")
        tgc_ids = get_tgc_ids(session)
        assert_catalog_endpoints(session, tgc_ids)

        print("STEP one_piece")
        one_piece_flow = assert_one_piece_flow(session, tgc_ids[ONE_PIECE_TCG_NAME], created_decks)

        print("STEP gundam")
        gundam_flow = assert_gundam_flow(session, tgc_ids[GUNDAM_TGC_NAME], created_decks)

        print("STEP digimon")
        assert_digimon_flow(session, tgc_ids[DIGIMON_TCG_NAME], created_decks)

        print("STEP collection.settings")
        original_profile = assert_collection_and_settings_flow(
            session,
            tgc_ids,
            one_piece_flow,
            gundam_flow,
            collection_snapshots,
        )

        if TEST_FEEDBACK:
            print("STEP feedback")
            assert_feedback_flow(session)

        print("STEP cleanup.decks")
        delete_created_decks(session, created_decks)
        created_decks.clear()

        print("STEP cleanup.collection")
        for card_id, snapshot in collection_snapshots.items():
            restore_collection_card(session, card_id, snapshot)

        print("STEP cleanup.settings")
        restore_settings(session, original_profile)

        print("STEP auth.logout")
        logout_response = request(session, "POST", "/auth/logout")
        expect_status(logout_response, 200, "Logout must work")
        session_after_logout = request(session, "GET", "/auth/session")
        expect_status(session_after_logout, 200, "Session fetch after logout must work")
        expect(session_after_logout.json()["authenticated"] is False, "Session must be anonymous after logout")

        if ISSUES:
            print("VALIDATION_ISSUES_START")
            for issue in ISSUES:
                print(issue)
            print("VALIDATION_ISSUES_END")
        print("VALIDATION_OK")
    finally:
        if created_decks:
            try:
                delete_created_decks(session, created_decks)
            except Exception:
                pass
        if collection_snapshots:
            for card_id, snapshot in collection_snapshots.items():
                try:
                    restore_collection_card(session, card_id, snapshot)
                except Exception:
                    pass
        if original_profile:
            try:
                restore_settings(session, original_profile)
            except Exception:
                pass


if __name__ == "__main__":
    main()
