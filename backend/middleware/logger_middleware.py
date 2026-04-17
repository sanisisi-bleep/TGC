import os
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.logger import logger


SENSITIVE_HEADERS = {"authorization", "cookie", "set-cookie"}


def _is_enabled(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _sanitize_headers(headers):
    return {
        key: ("<redacted>" if key.lower() in SENSITIVE_HEADERS else value)
        for key, value in headers.items()
    }


def _body_preview(body: bytes, limit: int = 2048) -> str:
    preview = body.decode("utf-8", errors="ignore")
    if len(preview) > limit:
        return f"{preview[:limit]}...(truncated)"
    return preview


class LoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        logger.info("REQUEST %s %s", request.method, request.url.path)
        if _is_enabled("LOG_REQUEST_HEADERS"):
            logger.debug("Request headers: %s", _sanitize_headers(dict(request.headers)))

        body = b""
        if request.method in {"POST", "PUT", "PATCH"}:
            try:
                body = await request.body()
                if _is_enabled("LOG_REQUEST_BODIES") and not request.url.path.startswith("/auth"):
                    logger.debug("Request body: %s", _body_preview(body))
            except Exception as exc:
                logger.warning("Error reading request body: %s", exc)

        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}

        request = Request(request.scope, receive)

        response = await call_next(request)

        process_time = time.time() - start_time
        logger.info(
            "RESPONSE %s %s status=%s duration=%.4fs",
            request.method,
            request.url.path,
            response.status_code,
            process_time,
        )

        return response
