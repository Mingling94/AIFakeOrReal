from __future__ import annotations

import logging
import threading
import time

import redis

from app.config import settings

logger = logging.getLogger(__name__)


class RateLimiter:
    """Fixed-window per-key rate limiter.

    Uses Redis (atomic INCR + EXPIRE) when available so limits hold across
    processes, and falls back to an in-process dict otherwise. Either way a
    backend failure fails open (the request is allowed) rather than erroring.
    """

    def __init__(self) -> None:
        self._client: redis.Redis | None = None
        try:
            self._client = redis.Redis.from_url(
                settings.REDIS_URL, socket_connect_timeout=1, decode_responses=True
            )
            self._client.ping()
        except (redis.RedisError, OSError) as exc:
            logger.warning("Redis unavailable, using in-memory rate limiter: %s", exc)
            self._client = None

        self._lock = threading.Lock()
        self._local: dict[str, tuple[int, float]] = {}

    def hit(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        """Register a hit. Returns (allowed, retry_after_seconds)."""
        if self._client is not None:
            try:
                return self._hit_redis(key, limit, window)
            except redis.RedisError as exc:
                logger.warning("Redis rate-limit check failed, failing open: %s", exc)
                return True, 0
        return self._hit_local(key, limit, window)

    def _hit_redis(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        redis_key = f"rl:{key}"
        count = self._client.incr(redis_key)  # type: ignore[union-attr]
        if count == 1:
            self._client.expire(redis_key, window)  # type: ignore[union-attr]
        if count > limit:
            ttl = self._client.ttl(redis_key)  # type: ignore[union-attr]
            return False, max(ttl, 1)
        return True, 0

    # Prune expired in-memory entries once the table grows past this size.
    _PRUNE_THRESHOLD = 10_000

    def _hit_local(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        now = time.monotonic()
        with self._lock:
            if len(self._local) > self._PRUNE_THRESHOLD:
                self._local = {
                    k: (c, ws)
                    for k, (c, ws) in self._local.items()
                    if now - ws < window
                }
            count, window_start = self._local.get(key, (0, now))
            if now - window_start >= window:
                count, window_start = 0, now
            count += 1
            self._local[key] = (count, window_start)
            if count > limit:
                return False, max(int(window - (now - window_start)), 1)
        return True, 0


rate_limiter = RateLimiter()
