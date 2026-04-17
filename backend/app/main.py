import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.env import load_environment
from app.database.connection import init_db
from app.logger import logger
from app.routes.auth import router as auth_router
from app.routes.cards import router as cards_router
from app.routes.collection import router as collection_router
from app.routes.decks import router as decks_router
from app.routes.settings import router as settings_router
from app.routes.tgc import router as tgc_router
from middleware.logger_middleware import LoggerMiddleware

load_environment()


def get_root_path():
    configured_root_path = os.getenv("FASTAPI_ROOT_PATH")
    if configured_root_path is not None:
        return configured_root_path.strip()

    if os.getenv("VERCEL") == "1":
        return "/api"

    return ""


def should_init_db_on_startup():
    raw_value = os.getenv("INIT_DB_ON_STARTUP", "true").strip().lower()
    return raw_value in {"1", "true", "yes", "on"}


app = FastAPI(root_path=get_root_path())


def get_allowed_origins():
    raw_origins = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logger middleware
app.add_middleware(LoggerMiddleware)

app.include_router(auth_router)
app.include_router(cards_router)
app.include_router(decks_router)
app.include_router(tgc_router)
app.include_router(collection_router)
app.include_router(settings_router)

@app.on_event("startup")
def on_startup():
    if should_init_db_on_startup():
        logger.info("Initializing database schema on startup")
        init_db()
    else:
        logger.info("Skipping database initialization on startup")

@app.get("/")
def read_root():
    return {"message": "TGC Collection Manager API"}
