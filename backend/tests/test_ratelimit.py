from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.services.ratelimit import RateLimiter


class TestRateLimiterLocal:
    def test_should_allow_up_to_limit(self) -> None:
        limiter = RateLimiter()
        limiter._client = None  # force in-memory backend
        for _ in range(3):
            allowed, _ = limiter.hit("k", limit=3, window=60)
            assert allowed is True

    def test_should_block_over_limit(self) -> None:
        limiter = RateLimiter()
        limiter._client = None
        for _ in range(3):
            limiter.hit("k", limit=3, window=60)
        allowed, retry_after = limiter.hit("k", limit=3, window=60)
        assert allowed is False
        assert retry_after >= 1

    def test_should_isolate_keys(self) -> None:
        limiter = RateLimiter()
        limiter._client = None
        limiter.hit("a", limit=1, window=60)
        allowed, _ = limiter.hit("b", limit=1, window=60)
        assert allowed is True


class TestVoteRateLimitEndpoint:
    @pytest.fixture(autouse=True)
    def _enable_rate_limit(self, monkeypatch):  # type: ignore[no-untyped-def]
        from app.api import deps
        from app.services import ratelimit

        monkeypatch.setattr(deps.settings, "RATE_LIMIT_ENABLED", True)
        monkeypatch.setattr(deps.settings, "VOTE_RATE_LIMIT", 3)
        # Fresh in-memory limiter so counts don't leak across tests.
        fresh = RateLimiter()
        fresh._client = None
        monkeypatch.setattr(ratelimit, "rate_limiter", fresh)
        monkeypatch.setattr(deps, "rate_limiter", fresh)

    def test_should_return_429_after_limit(self, client: TestClient) -> None:
        url = "http://example.com/rl"
        for _ in range(3):
            resp = client.post("/api/v1/vote", json={"url": url, "vote": "human"})
            assert resp.status_code == 200

        resp = client.post("/api/v1/vote", json={"url": url, "vote": "human"})
        assert resp.status_code == 429
        assert "Retry-After" in resp.headers
        assert "Rate limit exceeded" in resp.json()["detail"]
