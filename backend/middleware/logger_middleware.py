import os
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.logger import bind_log_context, logger, reset_log_context


SENSITIVE_HEADERS = {"authorization", "cookie", "set-cookie"}
TOKENIZED_PATH_PREFIXES = ("/decks/shared/", "/shared-deck/")


def _is_enabled(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _sanitize_headers(headers):
    return {
        key: ("<redacted>" if key.lower() in SENSITIVE_HEADERS else value)
        for key, value in headers.items()
    }


def _sanitize_path(path: str) -> str:
    sanitized_path = path or "/"

    for prefix in TOKENIZED_PATH_PREFIXES:
        if prefix in sanitized_path:
            head, _, _tail = sanitized_path.partition(prefix)
            return f"{head}{prefix}[token]"

    return sanitized_path


def _resolve_request_id(request: Request) -> str:
    return (
        request.headers.get("x-request-id")
        or request.headers.get("x-vercel-id")
        or uuid.uuid4().hex
    )


def _resolve_client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    if request.client:
        return request.client.host

    return None


def _log_response(status_code: int, duration_ms: float):
    if status_code >= 500:
        log_method = logger.error
    elif status_code >= 400:
        log_method = logger.warning
    else:
        log_method = logger.info

    log_method(
        "Request completed",
        extra={
            "event": "request_finished",
            "status_code": status_code,
            "duration_ms": duration_ms,
        },
    )


class LoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.perf_counter()
        request_id = _resolve_request_id(request)
        client_ip = _resolve_client_ip(request)
        context_tokens = bind_log_context(
            request_id=request_id,
            method=request.method,
            path=_sanitize_path(request.url.path),
            client_ip=client_ip,
        )

        request.state.request_id = request_id
        response = None

        logger.info(
            "Incoming request",
            extra={
                "event": "request_started",
                "query": request.url.query or None,
            },
        )

        if _is_enabled("LOG_REQUEST_HEADERS"):
            logger.debug(
                "Request headers",
                extra={
                    "event": "request_headers",
                    "headers": _sanitize_headers(dict(request.headers)),
                },
            )

        try:
            response = await call_next(request)
            return response
        except Exception:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.exception(
                "Unhandled request exception",
                extra={
                    "event": "request_failed",
                    "status_code": 500,
                    "duration_ms": duration_ms,
                },
            )
            raise
        finally:
            if response is not None:
                response.headers["X-Request-ID"] = request_id
                _log_response(
                    status_code=response.status_code,
                    duration_ms=round((time.perf_counter() - start_time) * 1000, 2),
                )

            reset_log_context(context_tokens)
