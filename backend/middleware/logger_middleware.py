import os
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.logger import bind_log_context, build_log_extra, logger, reset_log_context


SENSITIVE_HEADERS = {"authorization", "cookie", "set-cookie"}
TOKENIZED_PATH_PREFIXES = ("/decks/shared/", "/shared-deck/")
DEFAULT_SLOW_REQUEST_THRESHOLD_MS = float(os.getenv("SLOW_REQUEST_THRESHOLD_MS", "1200"))


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


def _sanitize_query(request: Request):
    if not request.url.query:
        return None

    if _is_enabled("LOG_REQUEST_QUERY_VALUES"):
        return {
            key: value
            for key, value in request.query_params.multi_items()
        }

    return sorted(set(request.query_params.keys()))


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


def _status_family(status_code: int) -> str:
    return f"{status_code // 100}xx"


def _log_response(status_code: int, duration_ms: float, route_template: str | None, response_size: str | None):
    if status_code >= 500:
        log_method = logger.error
    elif status_code >= 400:
        log_method = logger.warning
    elif duration_ms >= DEFAULT_SLOW_REQUEST_THRESHOLD_MS:
        log_method = logger.warning
    else:
        log_method = logger.info

    log_method(
        "Request completed",
        extra=build_log_extra(
            "request_finished",
            status_code=status_code,
            status_family=_status_family(status_code),
            duration_ms=duration_ms,
            slow_request=duration_ms >= DEFAULT_SLOW_REQUEST_THRESHOLD_MS,
            route_template=route_template,
            response_size=response_size,
        ),
    )


def _resolve_route_template(request: Request) -> str | None:
    route = request.scope.get("route")
    if route is None:
        return None
    return getattr(route, "path", None) or getattr(route, "name", None)


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
            extra=build_log_extra(
                "request_started",
                query=_sanitize_query(request),
            ),
        )

        if _is_enabled("LOG_REQUEST_HEADERS"):
            logger.debug(
                "Request headers",
                extra=build_log_extra(
                    "request_headers",
                    headers=_sanitize_headers(dict(request.headers)),
                ),
            )

        try:
            response = await call_next(request)
            return response
        except Exception:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.exception(
                "Unhandled request exception",
                extra=build_log_extra(
                    "request_failed",
                    status_code=500,
                    status_family="5xx",
                    duration_ms=duration_ms,
                    route_template=_resolve_route_template(request),
                ),
            )
            raise
        finally:
            if response is not None:
                response.headers["X-Request-ID"] = request_id
                _log_response(
                    status_code=response.status_code,
                    duration_ms=round((time.perf_counter() - start_time) * 1000, 2),
                    route_template=_resolve_route_template(request),
                    response_size=response.headers.get("content-length"),
                )

            reset_log_context(context_tokens)
