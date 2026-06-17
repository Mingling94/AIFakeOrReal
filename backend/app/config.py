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

    CORS_ORIGINS: list[str] = ["*"]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
