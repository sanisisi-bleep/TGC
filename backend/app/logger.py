import json
import logging
import os
import sys
from contextvars import ContextVar
from datetime import datetime, timezone


def _resolve_log_level():
    level_name = os.getenv("LOG_LEVEL", "INFO").strip().upper()
    return getattr(logging, level_name, logging.INFO)


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


class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "timestamp": datetime.now(timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
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
