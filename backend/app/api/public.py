from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.analysis import perform_analysis
from app.api.deps import get_db, rate_limit, record_api_usage
from app.models.url import URLScore
from app.models.vote import Vote
from app.schemas.check import CheckResponse, CheckSignals
from app.schemas.vote import VoteBreakdown
from app.services.detection import FetchError
from app.services.scoring import (
    hash_url,
    score_to_confidence,
    score_to_verdict,
    validate_url,
)

router = APIRouter(tags=["public"])


def _vote_breakdown(db: Session, url_hash: str) -> VoteBreakdown:
    votes = db.query(Vote).filter(Vote.url_hash == url_hash).all()
    breakdown = VoteBreakdown(total=len(votes))
    for v in votes:
        if v.vote == "human":
            breakdown.human += 1
        elif v.vote == "mixed":
            breakdown.mixed += 1
        elif v.vote == "ai_generated":
            breakdown.ai_generated += 1
    return breakdown


@router.get(
    "/check",
    response_model=CheckResponse,
    summary="Check whether a URL is AI-generated",
    description=(
        "The one-call public endpoint. Given any public content URL, returns a "
        "single verdict (`human`, `mixed`, `ai_generated`, or `unknown`) combining "
        "automated AI analysis with crowd votes.\n\n"
        "- Works for Reddit posts, Instagram/Facebook posts, reels, stories, "
        "videos, photos, and most pages that expose link-preview metadata.\n"
        "- Pass `analyze=true` to run (or refresh) AI analysis inline; otherwise "
        "the cached result and crowd votes are returned.\n"
        "- Send an optional `X-API-Key` header to attribute usage to your key."
    ),
)
async def check(
    url: str = Query(..., description="The content URL to check."),
    analyze: bool = Query(
        False, description="Run AI analysis inline if not already analyzed."
    ),
    db: Session = Depends(get_db),
    _key=Depends(record_api_usage),
    _rl=Depends(rate_limit("check", "CHECK_RATE_LIMIT")),
) -> CheckResponse:
    try:
        validate_url(url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    url_hash = hash_url(url)
    url_score = db.query(URLScore).filter(URLScore.url_hash == url_hash).first()

    if analyze and (url_score is None or url_score.ai_score is None):
        try:
            url_score, _ = await perform_analysis(db, url)
        except FetchError:
            # Analysis failed (e.g. login wall); fall back to whatever we have.
            url_score = db.query(URLScore).filter(URLScore.url_hash == url_hash).first()

    # Track how often this URL is checked (drives LLM fallback gating).
    if url_score is not None:
        url_score.check_count += 1
        db.commit()

    if url_score is None:
        return CheckResponse(
            url=url,
            platform="generic",
            content_type="unknown",
            verdict="unknown",
            ai_probability=None,
            confidence="none",
            analyzed=False,
            votes=VoteBreakdown(),
            signals=CheckSignals(),
        )

    return CheckResponse(
        url=url_score.url,
        platform=url_score.platform,
        content_type=url_score.content_type,
        verdict=score_to_verdict(url_score.combined_score),
        ai_probability=url_score.combined_score,
        confidence=score_to_confidence(url_score.vote_count, url_score.ai_score),
        analyzed=url_score.ai_score is not None,
        votes=_vote_breakdown(db, url_hash),
        signals=CheckSignals(
            ai_score=url_score.ai_score, crowd_score=url_score.crowd_score
        ),
    )
