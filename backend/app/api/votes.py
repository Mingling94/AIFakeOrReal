from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_optional_user
from app.models.url import URLScore
from app.models.user import User
from app.models.vote import Vote
from app.schemas.vote import VoteBreakdown, VoteCreate, VoteResponse
from app.services.scoring import (
    calculate_combined_score,
    calculate_crowd_score,
    extract_domain,
    hash_url,
)

router = APIRouter(tags=["votes"])


@router.post("/vote", response_model=VoteResponse)
def submit_vote(
    body: VoteCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> VoteResponse:
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

    vote = Vote(
        url_hash=url_hash,
        user_id=current_user.id if current_user else None,
        vote=body.vote.value,
        confidence=body.confidence,
    )
    db.add(vote)

    all_votes = db.query(Vote).filter(Vote.url_hash == url_hash).all()
    vote_data: list[tuple[str, float]] = []
    for v in all_votes:
        rep = 0.5
        if v.user_id and v.user:
            rep = v.user.reputation
        vote_data.append((v.vote, rep))
    vote_data.append(
        (body.vote.value, current_user.reputation if current_user else 0.3)
    )

    url_score.crowd_score = calculate_crowd_score(vote_data)
    url_score.vote_count = len(vote_data)
    url_score.combined_score = calculate_combined_score(
        url_score.ai_score, url_score.crowd_score, url_score.vote_count
    )

    if current_user:
        current_user.total_votes += 1

    db.commit()
    db.refresh(vote)

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
