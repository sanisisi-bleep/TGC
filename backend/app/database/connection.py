import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.models import Base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/tgc_db")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def ensure_card_columns():
    # Lightweight schema sync for new card metadata columns on existing PostgreSQL databases.
    statements = [
        "ALTER TABLE cards ADD COLUMN IF NOT EXISTS source_card_id VARCHAR(50)",
        "ALTER TABLE cards ADD COLUMN IF NOT EXISTS block INTEGER",
        "ALTER TABLE cards ADD COLUMN IF NOT EXISTS traits TEXT",
        "ALTER TABLE cards ADD COLUMN IF NOT EXISTS link TEXT",
        "ALTER TABLE cards ADD COLUMN IF NOT EXISTS zones TEXT",
        "ALTER TABLE cards ADD COLUMN IF NOT EXISTS artist VARCHAR(255)",
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


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
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def ensure_deck_columns():
    statements = [
        "ALTER TABLE decks ADD COLUMN IF NOT EXISTS tgc_id INTEGER",
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))

def init_db():
    Base.metadata.create_all(bind=engine)
    ensure_card_columns()
    ensure_game_detail_columns()
    ensure_deck_columns()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
