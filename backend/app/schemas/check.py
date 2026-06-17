from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.vote import VoteBreakdown


class CheckSignals(BaseModel):
    ai_score: float | None = Field(
        None,
        description="AI-model probability (0=human, 1=AI), or null if not analyzed.",
    )
    crowd_score: float | None = Field(
        None, description="Crowd-vote probability (0=human, 1=AI), or null if no votes."
    )


class CheckResponse(BaseModel):
    url: str
    platform: str = Field(
        description="Detected platform, e.g. reddit, instagram, generic."
    )
    content_type: str = Field(
        description="text, image, video, reel, story, post, or unknown."
    )
    verdict: str = Field(description="human, mixed, ai_generated, or unknown.")
    ai_probability: float | None = Field(
        None, description="Combined AI probability from 0 (human) to 1 (AI), or null."
    )
    confidence: str = Field(description="none, low, medium, or high.")
    analyzed: bool = Field(description="Whether AI analysis has run for this URL.")
    votes: VoteBreakdown
    signals: CheckSignals

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "url": "https://www.reddit.com/r/aiArt/comments/abc123/my_post/",
                    "platform": "reddit",
                    "content_type": "image",
                    "verdict": "ai_generated",
                    "ai_probability": 0.82,
                    "confidence": "high",
                    "analyzed": True,
                    "votes": {
                        "human": 3,
                        "mixed": 5,
                        "ai_generated": 42,
                        "total": 50,
                    },
                    "signals": {"ai_score": 0.78, "crowd_score": 0.85},
                }
            ]
        }
    }
