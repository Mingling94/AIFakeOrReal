from __future__ import annotations

import json
import logging
from typing import Any

import redis

from app.config import settings

logger = logging.getLogger(__name__)

_KEY_PREFIX = "score:"


class ScoreCache:
    """Thin Redis wrapper for caching score responses.

    Designed to degrade gracefully: if Redis is unreachable or caching is
    disabled (CACHE_TTL_SECONDS == 0), every operation becomes a no-op so the
    API keeps serving from the database without raising.
    """

    def __init__(self) -> None:
        self._ttl = settings.CACHE_TTL_SECONDS
        self._client: redis.Redis | None = None
        if self._ttl > 0:
            try:
                self._client = redis.Redis.from_url(
                    settings.REDIS_URL, socket_connect_timeout=1, decode_responses=True
                )
                self._client.ping()
            except (redis.RedisError, OSError) as exc:
                logger.warning("Redis unavailable, caching disabled: %s", exc)
                self._client = None

    @property
    def enabled(self) -> bool:
        return self._client is not None

    def get(self, url_hash: str) -> dict[str, Any] | None:
        if self._client is None:
            return None
        try:
            cached = self._client.get(_KEY_PREFIX + url_hash)
        except redis.RedisError as exc:
            logger.warning("Redis GET failed: %s", exc)
            return None
        return json.loads(cached) if cached else None

    def set(self, url_hash: str, value: dict[str, Any]) -> None:
        if self._client is None:
            return
        try:
            self._client.setex(
                _KEY_PREFIX + url_hash, self._ttl, json.dumps(value, default=str)
            )
        except redis.RedisError as exc:
            logger.warning("Redis SET failed: %s", exc)

    def invalidate(self, url_hash: str) -> None:
        if self._client is None:
            return
        try:
            self._client.delete(_KEY_PREFIX + url_hash)
        except redis.RedisError as exc:
            logger.warning("Redis DELETE failed: %s", exc)


score_cache = ScoreCache()
