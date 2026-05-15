import os
from sqlalchemy import create_engine, func, text
from sqlalchemy.orm import sessionmaker

from app.env import load_environment
from app.database.models import Base, Card, Deck, Tgc, User
from app.services.game_rules import (
    DIGIMON_TCG_NAME,
    GUNDAM_TCG_NAME,
    MAGIC_TCG_NAME,
    ONE_PIECE_TCG_NAME,
    RIFTBOUND_TCG_NAME,
    canonicalize_tgc_name,
)

load_environment()


def resolve_database_url():
    target = os.getenv("DATABASE_TARGET", "").strip().upper()
    pre_url = os.getenv("DATABASE_URL_PRE")
    pro_url = os.getenv("DATABASE_URL_PRO")
    default_url = os.getenv("DATABASE_URL")

    if target == "PRE" and pre_url:
        return pre_url
    if target == "PRO" and pro_url:
        return pro_url

    resolved_url = default_url or pro_url or pre_url
    if resolved_url:
        return resolved_url

    if os.getenv("VERCEL") == "1":
        raise RuntimeError(
            "DATABASE_URL, DATABASE_URL_PRE, or DATABASE_URL_PRO must be set for Vercel deployments."
        )

    return "postgresql://user:password@localhost/tgc_db"


DATABASE_URL = resolve_database_url()

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

CANONICAL_TGC_DESCRIPTIONS = {
    GUNDAM_TCG_NAME: "Gundam Card Game",
    ONE_PIECE_TCG_NAME: "One Piece Card Game",
    DIGIMON_TCG_NAME: "Digimon Card Game",
    MAGIC_TCG_NAME: "Magic: The Gathering",
    RIFTBOUND_TCG_NAME: "Riftbound",
}


def _run_schema_statements(statements):
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def _run_optional_schema_statements(statements):
    try:
        _run_schema_statements(statements)
    except Exception as error:
        print(f"[db] Optional schema statements skipped: {error}")


def ensure_card_columns():
    # Lightweight schema sync for new card metadata columns on existing PostgreSQL databases.
    statements = [
        "ALTER TABLE cards ADD COLUMN IF NOT EXISTS source_card_id VARCHAR(50)",
        "ALTER TABLE cards ADD COLUMN IF NOT EXISTS deck_key VARCHAR(50)",
        "ALTER TABLE cards ADD COLUMN IF NOT EXISTS block INTEGER",
        "ALTER TABLE cards ADD COLUMN IF NOT EXISTS traits TEXT",
        "ALTER TABLE cards ADD COLUMN IF NOT EXISTS link TEXT",
        "ALTER TABLE cards ADD COLUMN IF NOT EXISTS zones TEXT",
        "ALTER TABLE cards ADD COLUMN IF NOT EXISTS artist VARCHAR(255)",
        "ALTER TABLE cards ALTER COLUMN name TYPE VARCHAR(255)",
        "ALTER TABLE cards ALTER COLUMN color TYPE VARCHAR(100)",
        "UPDATE cards SET deck_key = source_card_id WHERE deck_key IS NULL AND source_card_id IS NOT NULL",
        "ALTER TABLE cards DROP CONSTRAINT IF EXISTS idx_cards_tgc_source_card_id",
        "DROP INDEX IF EXISTS idx_cards_tgc_source_card_id",
        (
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_tgc_source_card_version "
            "ON cards(tgc_id, source_card_id, version)"
        ),
        "CREATE INDEX IF NOT EXISTS idx_cards_tgc_id ON cards(tgc_id)",
        (
            "CREATE INDEX IF NOT EXISTS idx_cards_tgc_deck_key "
            "ON cards(tgc_id, deck_key) WHERE deck_key IS NOT NULL"
        ),
        "CREATE INDEX IF NOT EXISTS idx_cards_tgc_name_id ON cards(tgc_id, name, id)",
        (
            "CREATE INDEX IF NOT EXISTS idx_cards_tgc_card_type_lower "
            "ON cards(tgc_id, lower(card_type)) WHERE card_type IS NOT NULL"
        ),
        (
            "CREATE INDEX IF NOT EXISTS idx_cards_tgc_color_lower "
            "ON cards(tgc_id, lower(color)) WHERE color IS NOT NULL"
        ),
        (
            "CREATE INDEX IF NOT EXISTS idx_cards_tgc_rarity_lower "
            "ON cards(tgc_id, lower(rarity)) WHERE rarity IS NOT NULL"
        ),
        (
            "CREATE INDEX IF NOT EXISTS idx_cards_tgc_set_name_lower "
            "ON cards(tgc_id, lower(set_name)) WHERE set_name IS NOT NULL"
        ),
    ]

    _run_schema_statements(statements)

    if engine.dialect.name == "postgresql":
        _run_optional_schema_statements(
            [
                "CREATE EXTENSION IF NOT EXISTS pg_trgm",
                (
                    "CREATE INDEX IF NOT EXISTS idx_cards_name_trgm "
                    "ON cards USING gin (name gin_trgm_ops) WHERE name IS NOT NULL"
                ),
                (
                    "CREATE INDEX IF NOT EXISTS idx_cards_source_card_id_trgm "
                    "ON cards USING gin (source_card_id gin_trgm_ops) WHERE source_card_id IS NOT NULL"
                ),
                (
                    "CREATE INDEX IF NOT EXISTS idx_cards_set_name_trgm "
                    "ON cards USING gin (set_name gin_trgm_ops) WHERE set_name IS NOT NULL"
                ),
                (
                    "CREATE INDEX IF NOT EXISTS idx_cards_version_trgm "
                    "ON cards USING gin (version gin_trgm_ops) WHERE version IS NOT NULL"
                ),
            ]
        )


def ensure_game_detail_columns():
    statements = [
        "ALTER TABLE gundam_cards ADD COLUMN IF NOT EXISTS level INTEGER",
        "ALTER TABLE gundam_cards ADD COLUMN IF NOT EXISTS ap INTEGER",
        "ALTER TABLE gundam_cards ADD COLUMN IF NOT EXISTS hp INTEGER",
        "ALTER TABLE gundam_cards ADD COLUMN IF NOT EXISTS block INTEGER",
        "ALTER TABLE gundam_cards ADD COLUMN IF NOT EXISTS zone TEXT",
        "ALTER TABLE gundam_cards ADD COLUMN IF NOT EXISTS trait TEXT",
        "ALTER TABLE gundam_cards ADD COLUMN IF NOT EXISTS link TEXT",
        "ALTER TABLE gundam_cards ADD COLUMN IF NOT EXISTS effect TEXT",
        "ALTER TABLE gundam_cards ALTER COLUMN source_title TYPE TEXT",
        "ALTER TABLE gundam_cards ALTER COLUMN get_it TYPE TEXT",
        "ALTER TABLE gundam_cards ADD COLUMN IF NOT EXISTS artist VARCHAR(255)",
        "ALTER TABLE gundam_cards ADD COLUMN IF NOT EXISTS qa TEXT",
        "ALTER TABLE one_piece_cards ADD COLUMN IF NOT EXISTS power INTEGER",
        "ALTER TABLE one_piece_cards ADD COLUMN IF NOT EXISTS ability TEXT",
        "ALTER TABLE one_piece_cards ADD COLUMN IF NOT EXISTS qa TEXT",
        "ALTER TABLE digimon_cards ADD COLUMN IF NOT EXISTS dp INTEGER",
        "ALTER TABLE digimon_cards ADD COLUMN IF NOT EXISTS form VARCHAR(100)",
        "ALTER TABLE digimon_cards ADD COLUMN IF NOT EXISTS attribute VARCHAR(100)",
        "ALTER TABLE digimon_cards ADD COLUMN IF NOT EXISTS type_line TEXT",
        "ALTER TABLE digimon_cards ADD COLUMN IF NOT EXISTS digivolution_requirements TEXT",
        "ALTER TABLE digimon_cards ADD COLUMN IF NOT EXISTS special_digivolution TEXT",
        "ALTER TABLE digimon_cards ADD COLUMN IF NOT EXISTS inherited_effect TEXT",
        "ALTER TABLE digimon_cards ADD COLUMN IF NOT EXISTS security_effect TEXT",
        "ALTER TABLE digimon_cards ADD COLUMN IF NOT EXISTS rule_text TEXT",
        "ALTER TABLE digimon_cards ADD COLUMN IF NOT EXISTS notes TEXT",
        "ALTER TABLE digimon_cards ADD COLUMN IF NOT EXISTS qa TEXT",
        "ALTER TABLE digimon_cards ADD COLUMN IF NOT EXISTS is_alternative_art BOOLEAN DEFAULT FALSE",
        (
            "CREATE TABLE IF NOT EXISTS riftbound_cards ("
            "card_id INTEGER PRIMARY KEY REFERENCES cards(id), "
            "domains TEXT, "
            "energy_cost INTEGER, "
            "power_cost INTEGER, "
            "might INTEGER, "
            "tags TEXT, "
            "keywords TEXT, "
            "champion_tag VARCHAR(100), "
            "is_signature BOOLEAN DEFAULT FALSE, "
            "is_rune BOOLEAN DEFAULT FALSE, "
            "is_battlefield BOOLEAN DEFAULT FALSE, "
            "is_legend BOOLEAN DEFAULT FALSE, "
            "is_champion BOOLEAN DEFAULT FALSE, "
            "collector_number INTEGER, "
            "variant_code VARCHAR(50), "
            "set_code VARCHAR(50), "
            "legality_status VARCHAR(50), "
            "has_errata BOOLEAN DEFAULT FALSE, "
            "errata_source_url TEXT, "
            "updated_text TEXT)"
        ),
        "CREATE INDEX IF NOT EXISTS idx_riftbound_cards_set_code ON riftbound_cards(set_code)",
        "CREATE INDEX IF NOT EXISTS idx_riftbound_cards_legality_status ON riftbound_cards(legality_status)",
        "CREATE INDEX IF NOT EXISTS idx_riftbound_cards_champion_tag ON riftbound_cards(champion_tag)",
    ]

    _run_schema_statements(statements)


def ensure_deck_columns():
    statements = [
        (
            "CREATE TABLE IF NOT EXISTS deck_folders ("
            "id SERIAL PRIMARY KEY, "
            "user_id INTEGER REFERENCES users(id), "
            "tgc_id INTEGER REFERENCES tgc(id), "
            "name VARCHAR(100) NOT NULL, "
            "created_at TIMESTAMP DEFAULT NOW() NOT NULL)"
        ),
        "ALTER TABLE decks ADD COLUMN IF NOT EXISTS tgc_id INTEGER",
        "ALTER TABLE decks ADD COLUMN IF NOT EXISTS folder_id INTEGER",
        "ALTER TABLE decks ADD COLUMN IF NOT EXISTS riftbound_chosen_champion_card_id INTEGER",
        "ALTER TABLE decks ADD COLUMN IF NOT EXISTS share_token VARCHAR(64)",
        "ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS assigned_quantity INTEGER",
        (
            "CREATE TABLE IF NOT EXISTS deck_considering_cards ("
            "id SERIAL PRIMARY KEY, "
            "deck_id INTEGER REFERENCES decks(id), "
            "card_id INTEGER REFERENCES cards(id), "
            "quantity INTEGER DEFAULT 1)"
        ),
        (
            "CREATE TABLE IF NOT EXISTS deck_egg_cards ("
            "id SERIAL PRIMARY KEY, "
            "deck_id INTEGER REFERENCES decks(id), "
            "card_id INTEGER REFERENCES cards(id), "
            "quantity INTEGER DEFAULT 1, "
            "assigned_quantity INTEGER)"
        ),
        (
            "CREATE TABLE IF NOT EXISTS deck_zone_cards ("
            "id SERIAL PRIMARY KEY, "
            "deck_id INTEGER REFERENCES decks(id), "
            "card_id INTEGER REFERENCES cards(id), "
            "zone VARCHAR(30) NOT NULL, "
            "quantity INTEGER DEFAULT 1, "
            "assigned_quantity INTEGER)"
        ),
        (
            "CREATE TABLE IF NOT EXISTS deck_versions ("
            "id SERIAL PRIMARY KEY, "
            "deck_id INTEGER REFERENCES decks(id), "
            "version_number INTEGER NOT NULL, "
            "source VARCHAR(40) NOT NULL, "
            "label VARCHAR(100), "
            "snapshot_data TEXT NOT NULL, "
            "created_at TIMESTAMP DEFAULT NOW() NOT NULL)"
        ),
        "CREATE INDEX IF NOT EXISTS idx_deck_folders_user_id ON deck_folders(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_deck_folders_user_tgc_id ON deck_folders(user_id, tgc_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_deck_folders_user_tgc_name ON deck_folders(user_id, tgc_id, name)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_decks_share_token ON decks(share_token)",
        "CREATE INDEX IF NOT EXISTS idx_decks_user_id ON decks(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_decks_user_tgc_id ON decks(user_id, tgc_id)",
        "CREATE INDEX IF NOT EXISTS idx_decks_folder_id ON decks(folder_id)",
        "CREATE INDEX IF NOT EXISTS idx_decks_riftbound_chosen_champion_card_id ON decks(riftbound_chosen_champion_card_id)",
        "CREATE INDEX IF NOT EXISTS idx_deck_cards_deck_id ON deck_cards(deck_id)",
        "CREATE INDEX IF NOT EXISTS idx_deck_cards_deck_card_id ON deck_cards(deck_id, card_id)",
        "CREATE INDEX IF NOT EXISTS idx_deck_considering_cards_deck_id ON deck_considering_cards(deck_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_deck_considering_cards_deck_card_id ON deck_considering_cards(deck_id, card_id)",
        "CREATE INDEX IF NOT EXISTS idx_deck_egg_cards_deck_id ON deck_egg_cards(deck_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_deck_egg_cards_deck_card_id ON deck_egg_cards(deck_id, card_id)",
        "CREATE INDEX IF NOT EXISTS idx_deck_zone_cards_deck_id ON deck_zone_cards(deck_id)",
        "CREATE INDEX IF NOT EXISTS idx_deck_zone_cards_deck_zone ON deck_zone_cards(deck_id, zone)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_deck_zone_cards_deck_card_zone ON deck_zone_cards(deck_id, card_id, zone)",
        "CREATE INDEX IF NOT EXISTS idx_deck_versions_deck_id ON deck_versions(deck_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_deck_versions_deck_version_number ON deck_versions(deck_id, version_number)",
        "CREATE INDEX IF NOT EXISTS idx_deck_versions_created_at ON deck_versions(deck_id, created_at DESC)",
    ]

    _run_schema_statements(statements)



def ensure_user_columns():
    statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(30) DEFAULT 'player'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS advanced_mode BOOLEAN DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_tgc_id INTEGER",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS default_tgc_id INTEGER",
        "ALTER TABLE users ALTER COLUMN role SET DEFAULT 'player'",
        "ALTER TABLE users ALTER COLUMN advanced_mode SET DEFAULT FALSE",
        "UPDATE users SET role = 'player' WHERE role IS NULL OR trim(role) = ''",
        "UPDATE users SET advanced_mode = FALSE WHERE advanced_mode IS NULL",
    ]

    _run_schema_statements(statements)


def ensure_collection_indexes():
    statements = [
        "CREATE INDEX IF NOT EXISTS idx_user_collections_user_id ON user_collections(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_collections_user_card_id ON user_collections(user_id, card_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_collections_card_id ON user_collections(card_id)",
    ]

    _run_schema_statements(statements)


def ensure_rate_limit_tables():
    statements = [
        (
            "CREATE TABLE IF NOT EXISTS rate_limit_counters ("
            "id SERIAL PRIMARY KEY, "
            "bucket VARCHAR(100) NOT NULL, "
            "rate_key VARCHAR(255) NOT NULL, "
            "window_seconds INTEGER NOT NULL, "
            "window_started_at INTEGER NOT NULL, "
            "hits INTEGER NOT NULL DEFAULT 0, "
            "created_at TIMESTAMP DEFAULT NOW() NOT NULL)"
        ),
        (
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limit_counter_window "
            "ON rate_limit_counters(bucket, rate_key, window_seconds, window_started_at)"
        ),
        "CREATE INDEX IF NOT EXISTS idx_rate_limit_bucket_created_at ON rate_limit_counters(bucket, created_at)",
    ]

    _run_schema_statements(statements)


def ensure_tgc_canonicalization():
    db = SessionLocal()
    try:
        tgcs = db.query(Tgc).order_by(Tgc.id.asc()).all()
        if not tgcs:
            return

        card_counts = {
            tgc_id: quantity
            for tgc_id, quantity in (
                db.query(Card.tgc_id, func.count(Card.id))
                .group_by(Card.tgc_id)
                .all()
            )
            if tgc_id is not None
        }
        canonical_groups = {}
        for tgc in tgcs:
            canonical_name = canonicalize_tgc_name(tgc.name)
            if not canonical_name:
                continue
            canonical_groups.setdefault(canonical_name, []).append(tgc)

        has_changes = False

        for canonical_name, group in canonical_groups.items():
            target = max(
                group,
                key=lambda item: (
                    int((item.name or "").strip() == canonical_name),
                    int(card_counts.get(item.id, 0) > 0),
                    card_counts.get(item.id, 0),
                    -item.id,
                ),
            )

            if target.name != canonical_name:
                target.name = canonical_name
                has_changes = True

            canonical_description = CANONICAL_TGC_DESCRIPTIONS.get(canonical_name)
            if canonical_description and target.description != canonical_description:
                target.description = canonical_description
                has_changes = True

            for duplicate in group:
                if duplicate.id == target.id:
                    continue

                db.query(Card).filter(Card.tgc_id == duplicate.id).update({"tgc_id": target.id}, synchronize_session=False)
                db.query(Deck).filter(Deck.tgc_id == duplicate.id).update({"tgc_id": target.id}, synchronize_session=False)
                db.query(User).filter(User.favorite_tgc_id == duplicate.id).update({"favorite_tgc_id": target.id}, synchronize_session=False)
                db.query(User).filter(User.default_tgc_id == duplicate.id).update({"default_tgc_id": target.id}, synchronize_session=False)
                db.delete(duplicate)
                has_changes = True

        if has_changes:
            db.commit()
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    ensure_card_columns()
    ensure_game_detail_columns()
    ensure_deck_columns()
    ensure_user_columns()
    ensure_tgc_canonicalization()
    ensure_collection_indexes()
    ensure_rate_limit_tables()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
