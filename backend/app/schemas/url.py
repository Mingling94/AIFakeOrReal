from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ScoreResponse(BaseModel):
    url_hash: str
    url: str
    domain: str
    ai_score: float | None = None
    crowd_score: float | None = None
    combined_score: float | None = None
    vote_count: int = 0
    content_type: str = "unknown"
    last_analyzed: datetime | None = None
    confidence: str = "none"

    model_config = {"from_attributes": True}


class BatchScoreRequest(BaseModel):
    urls: list[str]


class BatchScoreResponse(BaseModel):
    scores: list[ScoreResponse]
