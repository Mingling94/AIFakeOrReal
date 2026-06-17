from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.url import URLScore
from app.schemas.url import BatchScoreRequest, BatchScoreResponse, ScoreResponse
from app.services.scoring import extract_domain, hash_url, score_to_confidence

router = APIRouter(tags=["scores"])


def _url_to_response(url_score: URLScore) -> ScoreResponse:
    return ScoreResponse(
        url_hash=url_score.url_hash,
        url=url_score.url,
        domain=url_score.domain,
        ai_score=url_score.ai_score,
        crowd_score=url_score.crowd_score,
        combined_score=url_score.combined_score,
        vote_count=url_score.vote_count,
        content_type=url_score.content_type,
        last_analyzed=url_score.last_analyzed,
        confidence=score_to_confidence(url_score.vote_count, url_score.ai_score),
    )


def _get_or_create_url(db: Session, url: str) -> URLScore:
    url_hash = hash_url(url)
    url_score = db.query(URLScore).filter(URLScore.url_hash == url_hash).first()
    if url_score is None:
        url_score = URLScore(
            url_hash=url_hash,
            url=url,
            domain=extract_domain(url),
        )
        db.add(url_score)
        db.commit()
        db.refresh(url_score)
    return url_score


@router.get("/score", response_model=ScoreResponse)
def get_score(
    url: str = Query(..., description="URL to look up"),
    db: Session = Depends(get_db),
) -> ScoreResponse:
    url_score = _get_or_create_url(db, url)
    return _url_to_response(url_score)


@router.post("/scores/batch", response_model=BatchScoreResponse)
def batch_scores(
    body: BatchScoreRequest,
    db: Session = Depends(get_db),
) -> BatchScoreResponse:
    results = []
    for url in body.urls[:50]:
        url_score = _get_or_create_url(db, url)
        results.append(_url_to_response(url_score))
    return BatchScoreResponse(scores=results)
