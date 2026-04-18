import os
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.database.connection import engine, init_db
from app.env import load_environment
from app.logger import get_request_id, logger
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


def get_allowed_origins():
    raw_origins = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


def _request_id_for(request: Request):
    return getattr(request.state, "request_id", None) or get_request_id()


def _error_payload(request: Request, detail):
    payload = {"detail": detail}
    request_id = _request_id_for(request)
    if request_id:
        payload["request_id"] = request_id
    return payload


def _health_payload(database_ok: bool, database_error: str | None = None):
    payload = {
        "status": "ok" if database_ok else "degraded",
        "service": "tgc-api",
        "environment": "vercel" if os.getenv("VERCEL") == "1" else "local",
        "database": "ok" if database_ok else "error",
        "timestamp": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
    }

    if database_error and os.getenv("SHOW_HEALTH_ERRORS", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }:
        payload["database_error"] = database_error

    return payload


def should_check_database_health():
    raw_value = os.getenv("HEALTHCHECK_DATABASE", "false").strip().lower()
    return raw_value in {"1", "true", "yes", "on"}


app = FastAPI(root_path=get_root_path())

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(LoggerMiddleware)

app.include_router(auth_router)
app.include_router(cards_router)
app.include_router(decks_router)
app.include_router(tgc_router)
app.include_router(collection_router)
app.include_router(settings_router)


@app.exception_handler(HTTPException)
async def handle_http_exception(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_payload(request, exc.detail),
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_exception(request: Request, exc: RequestValidationError):
    logger.warning(
        "Request validation failed",
        extra={
            "event": "request_validation_failed",
            "errors": exc.errors(),
        },
    )
    return JSONResponse(
        status_code=422,
        content=_error_payload(request, exc.errors()),
    )


@app.exception_handler(Exception)
async def handle_unexpected_exception(request: Request, exc: Exception):
    logger.exception(
        "Unhandled application exception",
        extra={
            "event": "unhandled_exception",
            "error": str(exc),
        },
    )
    return JSONResponse(
        status_code=500,
        content=_error_payload(request, "Internal server error"),
    )


@app.on_event("startup")
def on_startup():
    if should_init_db_on_startup():
        logger.info(
            "Initializing database schema on startup",
            extra={"event": "startup_init_db"},
        )
        init_db()
    else:
        logger.info(
            "Skipping database initialization on startup",
            extra={"event": "startup_skip_init_db"},
        )


@app.get("/")
def read_root():
    return {"message": "TGC Collection Manager API"}


@app.get("/health")
def health_check():
    if not should_check_database_health():
        payload = _health_payload(database_ok=True)
        payload["database"] = "skipped"
        return JSONResponse(status_code=200, content=payload)

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        payload = _health_payload(database_ok=True)
        return JSONResponse(status_code=200, content=payload)
    except Exception as exc:
        logger.exception(
            "Health check failed",
            extra={"event": "health_check_failed", "error": str(exc)},
        )
        payload = _health_payload(database_ok=False, database_error=str(exc))
        return JSONResponse(status_code=503, content=payload)
