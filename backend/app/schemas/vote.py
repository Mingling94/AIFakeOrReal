from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class VoteType(str, Enum):
    HUMAN = "human"
    MIXED = "mixed"
    AI_GENERATED = "ai_generated"


class VoteCreate(BaseModel):
    url: str
    vote: VoteType
    confidence: float | None = Field(None, ge=0.0, le=1.0)


class VoteResponse(BaseModel):
    id: str
    url_hash: str
    vote: str
    created_at: datetime

    model_config = {"from_attributes": True}


class VoteBreakdown(BaseModel):
    human: int = 0
    mixed: int = 0
    ai_generated: int = 0
    total: int = 0
