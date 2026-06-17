from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class SignalSummary(BaseModel):
    vocabulary_triggered: bool = False
    vocabulary_tier1_count: int = 0
    structure_triggered: bool = False
    structure_flags: list[str] = []
    comment_triggered: bool = False
    comment_examples: list[str] = []


class ScoreResponse(BaseModel):
    url_hash: str
    url: str
    domain: str
    ai_score: float | None = None
    crowd_score: float | None = None
    combined_score: float | None = None
    vote_count: int = 0
    platform: str = "generic"
    content_type: str = "unknown"
    last_analyzed: datetime | None = None
    confidence: str = "none"
    signals: SignalSummary | None = None

    model_config = {"from_attributes": True}


class BatchScoreRequest(BaseModel):
    urls: list[str]


class BatchScoreResponse(BaseModel):
    scores: list[ScoreResponse]
