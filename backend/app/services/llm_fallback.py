from __future__ import annotations

import json
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "You are an AI-content detector. Given a piece of text, assess whether it "
    "was written by an AI language model or a human. Consider vocabulary choices "
    "(overuse of words like 'delve', 'leverage', 'utilize', 'tapestry', "
    "'multifaceted', 'holistic', 'seamless'), structural patterns (uniform "
    "paragraph length, no contractions, repetitive sentence starters, em-dash "
    "overuse, tricolon repetition), tone (emotional flatness, excessive hedging, "
    "sycophancy), and phrase patterns (opener clichés like 'In today's "
    "fast-paced world', filler like 'It's important to note'). "
    "Respond with ONLY a JSON object: "
    '{"verdict": "human"|"mixed"|"ai_generated", "confidence": 0.0-1.0, '
    '"reasoning": "one sentence"}'
)


async def llm_assess(text: str) -> dict | None:
    """Call OpenAI's ChatGPT API to assess whether text is AI-generated.

    Uses the free-tier-compatible gpt-3.5-turbo model by default.
    Returns {"verdict": str, "confidence": float, "reasoning": str} or None
    if the LLM is disabled, unconfigured, or the call fails.
    """
    if not settings.LLM_FALLBACK_ENABLED or not settings.LLM_API_KEY:
        return None

    sample = text[:4000]

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.LLM_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.LLM_MODEL,
                    "max_tokens": 200,
                    "temperature": 0.0,
                    "messages": [
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        {"role": "user", "content": f"Assess this text:\n\n{sample}"},
                    ],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            result_text = data["choices"][0]["message"]["content"]
            return json.loads(result_text)
    except Exception as exc:
        logger.warning("LLM fallback failed: %s", exc)
        return None


def should_use_llm(ai_score: float, check_count: int) -> bool:
    """Decide whether to invoke the LLM fallback for this content."""
    if not settings.LLM_FALLBACK_ENABLED:
        return False
    uncertain = 0.3 <= ai_score <= 0.7
    high_traffic = check_count >= settings.LLM_VISIT_THRESHOLD
    return uncertain and high_traffic
