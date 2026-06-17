from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ReportCreate(BaseModel):
    url: str
    reported_verdict: str = Field(
        description="What you believe the correct verdict should be: human, mixed, or ai_generated."
    )
    reason: str | None = Field(None, max_length=1000)


class ReportResponse(BaseModel):
    id: str
    url_hash: str
    reported_verdict: str
    reason: str | None
    status: str
    created_at: datetime
