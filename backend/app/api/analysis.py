from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.url import URLScore
from app.services.cache import score_cache
from app.services.detection import ContentExtractor, TextAnalyzer
from app.services.scoring import (
    calculate_combined_score,
    extract_domain,
    hash_url,
)

router = APIRouter(tags=["analysis"])

content_extractor = ContentExtractor()
text_analyzer = TextAnalyzer()


@router.post("/analyze")
async def analyze_url(
    url: str = Query(..., description="URL to analyze"),
    db: Session = Depends(get_db),
) -> dict:
    url_hash = hash_url(url)

    url_score = db.query(URLScore).filter(URLScore.url_hash == url_hash).first()
    if url_score is None:
        url_score = URLScore(
            url_hash=url_hash,
            url=url,
            domain=extract_domain(url),
        )
        db.add(url_score)
        db.flush()

    try:
        content = await content_extractor.extract_from_url(url)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not fetch URL: {e}")

    analysis = text_analyzer.analyze_text(content["text"])

    url_score.ai_score = analysis["overall"]
    url_score.content_type = "text"
    url_score.last_analyzed = datetime.now(timezone.utc)
    url_score.combined_score = calculate_combined_score(
        url_score.ai_score, url_score.crowd_score, url_score.vote_count
    )

    db.commit()
    score_cache.invalidate(url_hash)

    return {
        "url_hash": url_hash,
        "url": url,
        "content": {
            "title": content["title"],
            "word_count": content["word_count"],
            "image_count": len(content["image_urls"]),
        },
        "analysis": analysis,
        "combined_score": url_score.combined_score,
    }


@router.get("/analysis")
def get_analysis(
    url: str = Query(..., description="URL to get analysis for"),
    db: Session = Depends(get_db),
) -> dict:
    url_hash = hash_url(url)
    url_score = db.query(URLScore).filter(URLScore.url_hash == url_hash).first()

    if url_score is None or url_score.ai_score is None:
        raise HTTPException(status_code=404, detail="No analysis found for this URL.")

    return {
        "url_hash": url_hash,
        "url": url_score.url,
        "ai_score": url_score.ai_score,
        "combined_score": url_score.combined_score,
        "content_type": url_score.content_type,
        "last_analyzed": url_score.last_analyzed,
    }
