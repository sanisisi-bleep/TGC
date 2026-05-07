import time
from dataclasses import dataclass
from threading import Lock

from fastapi import HTTPException, Request
from sqlalchemy.exc import IntegrityError

from app.database.connection import SessionLocal
from app.models import RateLimitCounter


@dataclass(frozen=True)
class RateLimitPolicy:
    bucket: str
    limit: int
    window_seconds: int


class DatabaseRateLimiter:
    def __init__(self, session_factory):
        self._session_factory = session_factory
        self._cleanup_lock = Lock()
        self._last_cleanup_at = 0.0

    def hit(self, bucket: str, key: str, limit: int, window_seconds: int) -> int | None:
        now = int(time.time())
        window_started_at = now - (now % window_seconds)

        with self._session_factory() as db:
            self._maybe_prune_stale_rows(db, now)

            while True:
                counter = (
                    db.query(RateLimitCounter)
                    .filter(
                        RateLimitCounter.bucket == bucket,
                        RateLimitCounter.rate_key == key,
                        RateLimitCounter.window_seconds == window_seconds,
                        RateLimitCounter.window_started_at == window_started_at,
                    )
                    .with_for_update()
                    .first()
                )

                if counter is None:
                    counter = RateLimitCounter(
                        bucket=bucket,
                        rate_key=key,
                        window_seconds=window_seconds,
                        window_started_at=window_started_at,
                        hits=1,
                    )
                    db.add(counter)
                    try:
                        db.commit()
                        return None
                    except IntegrityError:
                        db.rollback()
                        continue

                if counter.hits >= limit:
                    retry_after = max(1, (counter.window_started_at + window_seconds) - now)
                    db.rollback()
                    return retry_after

                counter.hits += 1
                db.add(counter)
                db.commit()
                return None

    def _maybe_prune_stale_rows(self, db, now: int):
        if now - self._last_cleanup_at < 300:
            return

        with self._cleanup_lock:
            if now - self._last_cleanup_at < 300:
                return

            prune_before = now - (2 * 24 * 60 * 60)
            (
                db.query(RateLimitCounter)
                .filter(RateLimitCounter.window_started_at < prune_before)
                .delete(synchronize_session=False)
            )
            db.commit()
            self._last_cleanup_at = now


limiter = DatabaseRateLimiter(SessionLocal)


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        first_hop = forwarded_for.split(",")[0].strip()
        if first_hop:
            return first_hop[:120]

    if request.client and request.client.host:
        return request.client.host[:120]

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
