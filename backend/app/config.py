from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres@db:5432/aifakeorreal"
    REDIS_URL: str = "redis://redis:6379/0"
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    AI_WEIGHT_LOW_VOTES: float = 0.8
    AI_WEIGHT_HIGH_VOTES: float = 0.4
    VOTE_THRESHOLD_LOW: int = 10
    VOTE_THRESHOLD_HIGH: int = 100

    # Browsers reject `Access-Control-Allow-Origin: *` together with
    # credentials, so we match Chrome extension origins by regex instead.
    # Set CORS_ORIGINS in the environment to allow specific web origins.
    CORS_ORIGINS: list[str] = []
    CORS_ORIGIN_REGEX: str = r"chrome-extension://.*"

    # Score cache TTL in seconds (Redis). Set to 0 to disable caching.
    CACHE_TTL_SECONDS: int = 3600

    # Rate limiting (per client IP, fixed window). Disable in tests.
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    VOTE_RATE_LIMIT: int = 30
    ANALYZE_RATE_LIMIT: int = 10
    CHECK_RATE_LIMIT: int = 120

    # Max URL length accepted by the API.
    MAX_URL_LENGTH: int = 2048
    # Max bytes downloaded when fetching a page for analysis.
    MAX_FETCH_BYTES: int = 2_000_000
    # Block fetches to private/loopback/link-local addresses (SSRF guard).
    BLOCK_PRIVATE_FETCH: bool = True

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
