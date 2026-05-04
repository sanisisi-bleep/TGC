from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import MetaData, create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = BASE_DIR / "tournament.db"


def _normalize_database_url(raw_url: str) -> str:
    normalized = (raw_url or "").strip()
    if not normalized:
        return normalized

    if normalized.startswith("postgres://"):
        normalized = "postgresql://" + normalized[len("postgres://"):]

    if not normalized.startswith("postgresql://"):
        return normalized

    parts = urlsplit(normalized)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.setdefault("sslmode", "require")
    normalized_query = urlencode(query)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, normalized_query, parts.fragment))


DATABASE_URL = _normalize_database_url(
    os.getenv(
        "TOURNAMENT_DATABASE_URL",
        f"sqlite:///{DEFAULT_DB_PATH.as_posix()}",
    )
)
IS_POSTGRES = DATABASE_URL.startswith("postgresql://")
DB_SCHEMA = (os.getenv("TOURNAMENT_DB_SCHEMA", "tournament_jornadas").strip() or "tournament_jornadas") if IS_POSTGRES else None

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, future=True, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
metadata = MetaData(schema=DB_SCHEMA) if DB_SCHEMA else MetaData()
Base = declarative_base(metadata=metadata)


def init_db():
    if IS_POSTGRES and DB_SCHEMA:
        with engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{DB_SCHEMA}"'))
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
