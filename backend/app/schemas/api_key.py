from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class APIKeyCreate(BaseModel):
    name: str = Field(default="", max_length=100, description="Label for this key.")


class APIKeyCreated(BaseModel):
    api_key: str = Field(description="The secret key. Shown only once — store it now.")
    prefix: str
    tier: str
    name: str


class APIKeyUsage(BaseModel):
    prefix: str
    tier: str
    name: str
    request_count: int
    created_at: datetime
