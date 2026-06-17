from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.url import URLScore
from app.schemas.url import (
    BatchScoreRequest,
    BatchScoreResponse,
    ScoreResponse,
    SignalSummary,
)
from app.services.cache import score_cache
from app.services.scoring import (
    extract_domain,
    hash_url,
    score_to_confidence,
    validate_url,
)
from app.services.sources import detect_platform

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
        platform=url_score.platform,
        content_type=url_score.content_type,
        last_analyzed=url_score.last_analyzed,
        confidence=score_to_confidence(url_score.vote_count, url_score.ai_score),
        signals=(
            SignalSummary(**url_score.analysis_signals)
            if url_score.analysis_signals
            else None
        ),
    )


def _get_or_create_url(db: Session, url: str) -> URLScore:
    url_hash = hash_url(url)
    url_score = db.query(URLScore).filter(URLScore.url_hash == url_hash).first()
    if url_score is None:
        url_score = URLScore(
            url_hash=url_hash,
            url=url,
            domain=extract_domain(url),
            platform=detect_platform(url),
        )
        db.add(url_score)
        db.commit()
        db.refresh(url_score)
    return url_score


def _cached_response(db: Session, url: str) -> ScoreResponse:
    url_hash = hash_url(url)
    cached = score_cache.get(url_hash)
    if cached is not None:
        return ScoreResponse(**cached)

    response = _url_to_response(_get_or_create_url(db, url))
    score_cache.set(url_hash, response.model_dump())
    return response


@router.get("/score", response_model=ScoreResponse)
def get_score(
    url: str = Query(..., description="URL to look up"),
    db: Session = Depends(get_db),
) -> ScoreResponse:
    try:
        validate_url(url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _cached_response(db, url)


@router.post("/scores/batch", response_model=BatchScoreResponse)
def batch_scores(
    body: BatchScoreRequest,
    db: Session = Depends(get_db),
) -> BatchScoreResponse:
    results = []
    for url in body.urls[:50]:
        try:
            validate_url(url)
        except ValueError:
            continue  # skip malformed URLs rather than failing the batch
        results.append(_cached_response(db, url))
    return BatchScoreResponse(scores=results)
