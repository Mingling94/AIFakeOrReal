from __future__ import annotations

import hashlib
from urllib.parse import urlparse, urlunparse

from app.config import settings


def validate_url(url: str) -> None:
    """Validate a user-supplied URL, raising ValueError if unacceptable."""
    if not url or not url.strip():
        raise ValueError("URL must not be empty.")
    if len(url) > settings.MAX_URL_LENGTH:
        raise ValueError(
            f"URL exceeds the maximum length of {settings.MAX_URL_LENGTH} characters."
        )
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("URL must use the http or https scheme.")
    if not parsed.netloc:
        raise ValueError("URL must include a host.")


def normalize_url(url: str) -> str:
    parsed = urlparse(url)
    normalized = urlunparse(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            parsed.path.rstrip("/") or "/",
            parsed.params,
            parsed.query,
            "",
        )
    )
    return normalized


def hash_url(url: str) -> str:
    normalized = normalize_url(url)
    return hashlib.sha256(normalized.encode()).hexdigest()


def extract_domain(url: str) -> str:
    return urlparse(url).netloc.lower()


VOTE_SCORES = {"human": 0.0, "mixed": 0.5, "ai_generated": 1.0}


def calculate_crowd_score(
    votes: list[tuple[str, float]],
) -> float | None:
    """Calculate crowd score from list of (vote_type, voter_reputation) tuples."""
    if not votes:
        return None

    weighted_sum = 0.0
    weight_total = 0.0
    for vote_type, reputation in votes:
        weight = max(reputation, 0.1)
        weighted_sum += VOTE_SCORES.get(vote_type, 0.5) * weight
        weight_total += weight

    if weight_total == 0:
        return None
    return weighted_sum / weight_total


def calculate_combined_score(
    ai_score: float | None,
    crowd_score: float | None,
    vote_count: int,
) -> float | None:
    if ai_score is None and crowd_score is None:
        return None
    if ai_score is None:
        return crowd_score
    if crowd_score is None:
        return ai_score

    low = settings.VOTE_THRESHOLD_LOW
    high = settings.VOTE_THRESHOLD_HIGH
    w_ai_low = settings.AI_WEIGHT_LOW_VOTES
    w_ai_high = settings.AI_WEIGHT_HIGH_VOTES

    if vote_count <= low:
        ai_weight = w_ai_low
    elif vote_count >= high:
        ai_weight = w_ai_high
    else:
        ratio = (vote_count - low) / (high - low)
        ai_weight = w_ai_low - ratio * (w_ai_low - w_ai_high)

    crowd_weight = 1.0 - ai_weight
    return ai_weight * ai_score + crowd_weight * crowd_score


def score_to_confidence(vote_count: int, ai_score: float | None) -> str:
    if vote_count == 0 and ai_score is None:
        return "none"
    if vote_count < 5:
        return "low"
    if vote_count < 50:
        return "medium"
    return "high"
