from __future__ import annotations

from app.services.cache import ScoreCache


class TestScoreCacheDisabled:
    def test_should_be_disabled_when_ttl_is_zero(self, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        from app.services import cache as cache_module

        monkeypatch.setattr(cache_module.settings, "CACHE_TTL_SECONDS", 0)
        c = ScoreCache()
        assert c.enabled is False

    def test_get_should_return_none_when_disabled(self, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        from app.services import cache as cache_module

        monkeypatch.setattr(cache_module.settings, "CACHE_TTL_SECONDS", 0)
        c = ScoreCache()
        assert c.get("any-hash") is None

    def test_mutations_should_noop_when_disabled(self, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        from app.services import cache as cache_module

        monkeypatch.setattr(cache_module.settings, "CACHE_TTL_SECONDS", 0)
        c = ScoreCache()
        # Neither call should raise even though no Redis is configured.
        c.set("any-hash", {"value": 1})
        c.invalidate("any-hash")


class TestScoreCacheGracefulDegradation:
    def test_should_disable_when_redis_unreachable(self, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        from app.services import cache as cache_module

        monkeypatch.setattr(cache_module.settings, "CACHE_TTL_SECONDS", 3600)
        # Point at an unroutable address so the connection fails fast.
        monkeypatch.setattr(
            cache_module.settings, "REDIS_URL", "redis://127.0.0.1:6390/0"
        )
        c = ScoreCache()
        assert c.enabled is False
        assert c.get("any-hash") is None  # still safe to call
