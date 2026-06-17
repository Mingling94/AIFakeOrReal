from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, rate_limit
from app.models.url import URLScore
from app.services.cache import score_cache
from app.services.comment_signal import detect_ai_accusations
from app.services.detection import FetchError, TextAnalyzer
from app.services.scoring import (
    calculate_combined_score,
    extract_domain,
    hash_url,
    validate_url,
)
from app.services.sources import detect_platform, extract_content

router = APIRouter(tags=["analysis"])

text_analyzer = TextAnalyzer()


def _get_or_create(db: Session, url: str) -> URLScore:
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
        db.flush()
    return url_score


async def perform_analysis(db: Session, url: str) -> tuple[URLScore, dict]:
    """Extract content for a URL, run AI detection, and persist the result.

    Shared by POST /analyze and the public /check endpoint. Raises FetchError
    if the content cannot be safely fetched.
    """
    url_score = _get_or_create(db, url)
    content = await extract_content(url)
    analysis = text_analyzer.analyze_text(content.text)

    # Comment accusations ("this is AI generated") are a strong human signal;
    # scan the post's comments and visible page text for them.
    scan_text = "\n".join(content.comments) + "\n" + content.text
    accusation = detect_ai_accusations(scan_text)
    analysis["comment_signal"] = {
        "triggered": accusation.triggered,
        "strong_hits": accusation.strong_hits,
        "weak_hits": accusation.weak_hits,
        "score": accusation.score,
        "examples": accusation.examples,
    }

    ai_score = analysis["overall"]
    if accusation.triggered:
        # A clear crowd accusation outweighs the weak stylometric estimate.
        ai_score = max(ai_score, accusation.score)

    url_score.ai_score = ai_score
    url_score.platform = content.platform
    url_score.content_type = content.content_type
    url_score.last_analyzed = datetime.now(timezone.utc)
    url_score.combined_score = calculate_combined_score(
        url_score.ai_score, url_score.crowd_score, url_score.vote_count
    )

    db.commit()
    score_cache.invalidate(url_score.url_hash)
    return url_score, {"content": content, "analysis": analysis}


@router.post(
    "/analyze",
    dependencies=[Depends(rate_limit("analyze", "ANALYZE_RATE_LIMIT"))],
)
async def analyze_url(
    url: str = Query(..., description="URL to analyze"),
    db: Session = Depends(get_db),
) -> dict:
    try:
        validate_url(url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    try:
        url_score, extra = await perform_analysis(db, url)
    except FetchError as e:
        raise HTTPException(status_code=422, detail=f"Could not fetch URL: {e}")

    content = extra["content"]
    return {
        "url_hash": url_score.url_hash,
        "url": url,
        "platform": content.platform,
        "content_type": content.content_type,
        "content": {
            "title": content.title,
            "author": content.author,
            "media_count": len(content.media_urls),
        },
        "analysis": extra["analysis"],
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
        "platform": url_score.platform,
        "content_type": url_score.content_type,
        "last_analyzed": url_score.last_analyzed,
    }
