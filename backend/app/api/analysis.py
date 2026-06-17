from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, rate_limit
from app.models.url import URLScore
from app.services.cache import score_cache
from app.services.comment_signal import detect_ai_accusations
from app.services.detection import FetchError, TextAnalyzer
from app.services.llm_fallback import llm_assess, should_use_llm
from app.services.structure_signal import detect_ai_structure
from app.services.vocabulary_signal import detect_ai_vocabulary
from app.services.scoring import (
    calculate_combined_score,
    extract_domain,
    hash_url,
    validate_url,
)
from app.services.sources import ExtractedContent, detect_platform, extract_content
from app.schemas.analysis import AnalyzeContentRequest

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


async def perform_analysis(
    db: Session, url: str, content: ExtractedContent | None = None
) -> tuple[URLScore, dict]:
    """Run AI detection for a URL and persist the result.

    If `content` is provided (e.g. extracted client-side by the browser
    extension, including comments behind a login wall), it is used directly;
    otherwise the content is fetched server-side. Raises FetchError if a
    server-side fetch fails. Shared by /analyze, /analyze/content, and /check.
    """
    url_score = _get_or_create(db, url)
    if content is None:
        content = await extract_content(url)
    stylometric = text_analyzer.analyze_text(content.text)
    vocab = detect_ai_vocabulary(content.text)
    structure = detect_ai_structure(content.text)

    comment_text = "\n".join(content.comments)
    accusation = detect_ai_accusations(comment_text)

    # Build the combined analysis dict with all signal details.
    analysis = {
        **stylometric,
        "vocabulary_signal": {
            "triggered": vocab.triggered,
            "tier1_count": vocab.tier1_count,
            "tier2_count": vocab.tier2_count,
            "phrase_count": vocab.phrase_count,
            "density": vocab.density,
            "score": vocab.score,
            "examples": vocab.examples,
        },
        "structure_signal": {
            "triggered": structure.triggered,
            "flags": structure.flags,
            "flag_count": structure.flag_count,
            "score": structure.score,
        },
        "comment_signal": {
            "triggered": accusation.triggered,
            "strong_hits": accusation.strong_hits,
            "weak_hits": accusation.weak_hits,
            "score": accusation.score,
            "examples": accusation.examples,
        },
    }

    # Weighted combination of all heuristic signals. Vocabulary and structure
    # detectors are derived from the "How Not to Sound Like AI" checklist and
    # are more reliable than the statistical stylometric baseline.
    ai_score = (
        0.15 * stylometric["overall"]
        + 0.35 * vocab.score
        + 0.30 * structure.score
        + 0.20 * accusation.score
    )
    ai_score = max(0.0, min(1.0, ai_score))

    # A strong accusation signal still acts as a floor.
    if accusation.triggered:
        ai_score = max(ai_score, accusation.score)

    # LLM fallback: for high-traffic content where heuristics are uncertain,
    # optionally call an LLM for a second opinion. Expensive; gated by config.
    llm_result = None
    if should_use_llm(ai_score, url_score.check_count):
        llm_result = await llm_assess(content.text)
        if llm_result:
            llm_conf = llm_result.get("confidence", 0.5)
            llm_verdict = llm_result.get("verdict", "mixed")
            llm_score = {"human": 0.1, "mixed": 0.5, "ai_generated": 0.9}.get(
                llm_verdict, 0.5
            ) * llm_conf
            # Blend: 60% heuristic, 40% LLM when LLM is invoked.
            ai_score = 0.6 * ai_score + 0.4 * llm_score
            ai_score = max(0.0, min(1.0, ai_score))
    analysis["llm_fallback"] = llm_result
    analysis["overall"] = round(ai_score, 4)

    url_score.ai_score = ai_score
    url_score.platform = content.platform
    url_score.content_type = content.content_type
    url_score.analysis_signals = {
        "vocabulary_triggered": vocab.triggered,
        "vocabulary_tier1_count": vocab.tier1_count,
        "structure_triggered": structure.triggered,
        "structure_flags": structure.flags,
        "comment_triggered": accusation.triggered,
        "comment_examples": accusation.examples[:3],
    }
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

    return _analysis_response(url_score, extra)


def _analysis_response(url_score: URLScore, extra: dict) -> dict:
    content = extra["content"]
    return {
        "url_hash": url_score.url_hash,
        "url": url_score.url,
        "platform": content.platform,
        "content_type": content.content_type,
        "content": {
            "title": content.title,
            "author": content.author,
            "media_count": len(content.media_urls),
            "comment_count": len(content.comments),
        },
        "analysis": extra["analysis"],
        "combined_score": url_score.combined_score,
    }


@router.post(
    "/analyze/content",
    summary="Analyze client-extracted content",
    dependencies=[Depends(rate_limit("analyze", "ANALYZE_RATE_LIMIT"))],
)
async def analyze_content(
    body: AnalyzeContentRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Analyze page content extracted by the client (e.g. the extension).

    Use this when the content lives behind a login wall or only appears after
    interaction (expanding comments) — the extension reads the page the user is
    already viewing and posts the text + comments here.
    """
    try:
        validate_url(body.url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    content = ExtractedContent(
        platform=body.platform or detect_platform(body.url),
        content_type=body.content_type or "unknown",
        title=body.title,
        text=body.text,
        comments=body.comments,
    )
    url_score, extra = await perform_analysis(db, body.url, content=content)
    return _analysis_response(url_score, extra)


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
