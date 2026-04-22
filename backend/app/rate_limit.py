import time
from collections import defaultdict, deque
from dataclasses import dataclass
from threading import Lock

from fastapi import HTTPException, Request


@dataclass(frozen=True)
class RateLimitPolicy:
    bucket: str
    limit: int
    window_seconds: int


class InMemoryRateLimiter:
    def __init__(self):
        self._events = defaultdict(deque)
        self._lock = Lock()

    def hit(self, bucket: str, key: str, limit: int, window_seconds: int) -> int | None:
        now = time.time()
        window_start = now - window_seconds
        bucket_key = (bucket, key)

        with self._lock:
            events = self._events[bucket_key]

            while events and events[0] <= window_start:
                events.popleft()

            if len(events) >= limit:
                retry_after = max(1, int(events[0] + window_seconds - now))
                return retry_after

            events.append(now)
            return None


limiter = InMemoryRateLimiter()


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    if request.client and request.client.host:
        return request.client.host

    return "unknown"


def _normalize_key_fragment(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    return normalized[:120] or "anonymous"


def enforce_rate_limit(
    request: Request,
    policy: RateLimitPolicy,
    key_fragment: str | None = None,
):
    client_ip = get_client_ip(request)
    rate_limit_key = client_ip

    if key_fragment is not None:
        rate_limit_key = f"{client_ip}|{_normalize_key_fragment(key_fragment)}"

    retry_after = limiter.hit(
        bucket=policy.bucket,
        key=rate_limit_key,
        limit=policy.limit,
        window_seconds=policy.window_seconds,
    )

    if retry_after is None:
        return

    raise HTTPException(
        status_code=429,
        detail=(
            f"Demasiados intentos. Espera {retry_after} segundos antes de volver a intentarlo."
        ),
        headers={"Retry-After": str(retry_after)},
    )
