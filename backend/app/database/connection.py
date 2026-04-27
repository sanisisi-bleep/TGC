import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.env import load_environment
from app.database.models import Base

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


def _run_schema_statements(statements):
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))

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
        "ALTER TABLE gundam_cards ADD COLUMN IF NOT EXISTS artist VARCHAR(255)",
        "ALTER TABLE one_piece_cards ADD COLUMN IF NOT EXISTS power INTEGER",
        "ALTER TABLE one_piece_cards ADD COLUMN IF NOT EXISTS ability TEXT",
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
    ]

    _run_schema_statements(statements)


def ensure_deck_columns():
    statements = [
        "ALTER TABLE decks ADD COLUMN IF NOT EXISTS tgc_id INTEGER",
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
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_decks_share_token ON decks(share_token)",
        "CREATE INDEX IF NOT EXISTS idx_decks_user_id ON decks(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_decks_user_tgc_id ON decks(user_id, tgc_id)",
        "CREATE INDEX IF NOT EXISTS idx_deck_cards_deck_id ON deck_cards(deck_id)",
        "CREATE INDEX IF NOT EXISTS idx_deck_cards_deck_card_id ON deck_cards(deck_id, card_id)",
        "CREATE INDEX IF NOT EXISTS idx_deck_considering_cards_deck_id ON deck_considering_cards(deck_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_deck_considering_cards_deck_card_id ON deck_considering_cards(deck_id, card_id)",
        "CREATE INDEX IF NOT EXISTS idx_deck_egg_cards_deck_id ON deck_egg_cards(deck_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_deck_egg_cards_deck_card_id ON deck_egg_cards(deck_id, card_id)",
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

def init_db():
    Base.metadata.create_all(bind=engine)
    ensure_card_columns()
    ensure_game_detail_columns()
    ensure_deck_columns()
    ensure_user_columns()
    ensure_collection_indexes()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
