from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_db, get_optional_user, rate_limit
from app.models.url import URLScore
from app.models.user import User
from app.models.vote import Vote
from app.schemas.vote import VoteBreakdown, VoteCreate, VoteResponse
from app.services.cache import score_cache
from app.services.scoring import (
    calculate_combined_score,
    calculate_crowd_score,
    extract_domain,
    hash_url,
    validate_url,
)

router = APIRouter(tags=["votes"])

# Reputation weight applied to votes cast without an account.
ANONYMOUS_REPUTATION = 0.3


def _recalculate_scores(db: Session, url_score: URLScore) -> None:
    """Recompute crowd and combined scores from all persisted votes."""
    votes = (
        db.query(Vote)
        .options(joinedload(Vote.user))  # avoid an N+1 lookup per voter
        .filter(Vote.url_hash == url_score.url_hash)
        .all()
    )
    vote_data = [
        (v.vote, v.user.reputation if v.user else ANONYMOUS_REPUTATION) for v in votes
    ]
    url_score.crowd_score = calculate_crowd_score(vote_data)
    url_score.vote_count = len(vote_data)
    url_score.combined_score = calculate_combined_score(
        url_score.ai_score, url_score.crowd_score, url_score.vote_count
    )


@router.post(
    "/vote",
    response_model=VoteResponse,
    dependencies=[Depends(rate_limit("vote", "VOTE_RATE_LIMIT"))],
)
def submit_vote(
    body: VoteCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> VoteResponse:
    try:
        validate_url(body.url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    url_hash = hash_url(body.url)

    url_score = db.query(URLScore).filter(URLScore.url_hash == url_hash).first()
    if url_score is None:
        url_score = URLScore(
            url_hash=url_hash,
            url=body.url,
            domain=extract_domain(body.url),
        )
        db.add(url_score)
        db.flush()

    # A signed-in user gets one vote per URL: re-voting updates their choice
    # rather than stuffing the ballot. Anonymous votes cannot be deduplicated.
    existing = None
    if current_user is not None:
        existing = (
            db.query(Vote)
            .filter(Vote.url_hash == url_hash, Vote.user_id == current_user.id)
            .first()
        )

    if existing is not None:
        existing.vote = body.vote.value
        existing.confidence = body.confidence
        vote = existing
    else:
        vote = Vote(
            url_hash=url_hash,
            user_id=current_user.id if current_user else None,
            vote=body.vote.value,
            confidence=body.confidence,
        )
        db.add(vote)
        if current_user is not None:
            current_user.total_votes += 1

    db.flush()  # make the new/updated vote visible to the recount query
    _recalculate_scores(db, url_score)

    db.commit()
    db.refresh(vote)
    score_cache.invalidate(url_hash)

    return VoteResponse(
        id=str(vote.id),
        url_hash=vote.url_hash,
        vote=vote.vote,
        created_at=vote.created_at,
    )


@router.get("/votes", response_model=VoteBreakdown)
def get_votes(
    url: str = Query(..., description="URL to get vote breakdown for"),
    db: Session = Depends(get_db),
) -> VoteBreakdown:
    url_hash = hash_url(url)
    votes = db.query(Vote).filter(Vote.url_hash == url_hash).all()

    breakdown = VoteBreakdown()
    for v in votes:
        if v.vote == "human":
            breakdown.human += 1
        elif v.vote == "mixed":
            breakdown.mixed += 1
        elif v.vote == "ai_generated":
            breakdown.ai_generated += 1
    breakdown.total = len(votes)

    return breakdown
