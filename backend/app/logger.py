import json
import logging
import os
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

from app.env import load_environment


load_environment()


def _resolve_log_level():
    level_name = os.getenv("LOG_LEVEL", "INFO").strip().upper()
    return getattr(logging, level_name, logging.INFO)


def _resolve_environment_name():
    if os.getenv("APP_ENVIRONMENT"):
        return os.getenv("APP_ENVIRONMENT").strip() or "local"
    return "vercel" if os.getenv("VERCEL") == "1" else "local"


def _normalize_log_value(value):
    if isinstance(value, str):
        normalized = value.strip()
        return normalized or None
    return value


_REQUEST_CONTEXT_VARS = {
    "request_id": ContextVar("request_id", default=None),
    "method": ContextVar("request_method", default=None),
    "path": ContextVar("request_path", default=None),
    "client_ip": ContextVar("request_client_ip", default=None),
    "user_id": ContextVar("request_user_id", default=None),
    "username": ContextVar("request_username", default=None),
    "user_role": ContextVar("request_user_role", default=None),
}

_STANDARD_LOG_RECORD_ATTRS = set(
    logging.LogRecord("", 0, "", 0, "", (), None).__dict__.keys()
) | {"asctime", "message"}

LOG_SERVICE_NAME = (os.getenv("LOG_SERVICE_NAME") or "tgc-api").strip() or "tgc-api"
LOG_ENVIRONMENT = _resolve_environment_name()


def bind_log_context(**values):
    tokens = {}

    for key, value in values.items():
        context_var = _REQUEST_CONTEXT_VARS.get(key)
        if context_var is None:
            continue
        tokens[key] = context_var.set(value)

    return tokens


def update_log_context(**values):
    for key, value in values.items():
        context_var = _REQUEST_CONTEXT_VARS.get(key)
        if context_var is None:
            continue
        context_var.set(value)


def reset_log_context(tokens):
    for key, token in tokens.items():
        context_var = _REQUEST_CONTEXT_VARS.get(key)
        if context_var is None:
            continue
        context_var.reset(token)


def get_log_context():
    context = {}

    for key, context_var in _REQUEST_CONTEXT_VARS.items():
        value = context_var.get()
        if value not in (None, ""):
            context[key] = value

    return context


def get_request_id():
    return _REQUEST_CONTEXT_VARS["request_id"].get()


def build_log_extra(event: str, **values):
    payload = {"event": event}

    for key, value in values.items():
        normalized_value = _normalize_log_value(value)
        if normalized_value is None:
            continue
        payload[key] = normalized_value

    return payload


def mask_identifier(identifier: str | None):
    normalized_identifier = _normalize_log_value(identifier)
    if not normalized_identifier:
        return None

    if "@" in normalized_identifier:
        local_part, _, domain = normalized_identifier.partition("@")
        masked_local = f"{local_part[:2]}***" if local_part else "***"
        domain_head, dot, domain_tail = domain.partition(".")
        masked_domain = f"{domain_head[:1]}***"
        if dot and domain_tail:
            masked_domain = f"{masked_domain}.{domain_tail}"
        return f"{masked_local}@{masked_domain}"

    if len(normalized_identifier) <= 3:
        return f"{normalized_identifier[:1]}***"

    return f"{normalized_identifier[:3]}***"


class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "timestamp": datetime.now(timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "service": LOG_SERVICE_NAME,
            "environment": LOG_ENVIRONMENT,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        payload.update(get_log_context())

        for key, value in record.__dict__.items():
            if key in _STANDARD_LOG_RECORD_ATTRS or key.startswith("_"):
                continue
            if value is None:
                continue
            payload[key] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str, ensure_ascii=True)


logger = logging.getLogger("tgc_app")
logger.setLevel(_resolve_log_level())

if not logger.handlers:
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(_resolve_log_level())
    console_handler.setFormatter(JsonFormatter())
    logger.addHandler(console_handler)

logger.propagate = False
