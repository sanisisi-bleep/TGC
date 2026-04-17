import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from middleware.logger_middleware import LoggerMiddleware
from app.database.connection import init_db
from app.routes.auth import router as auth_router
from app.routes.cards import router as cards_router
from app.routes.decks import router as decks_router
from app.routes.tgc import router as tgc_router
from app.routes.collection import router as collection_router
from app.routes.settings import router as settings_router

app = FastAPI()


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
    init_db()

@app.get("/")
def read_root():
    return {"message": "TGC Collection Manager API"}
