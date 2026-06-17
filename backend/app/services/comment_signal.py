from __future__ import annotations

import re
from dataclasses import dataclass

# Heuristic: people very often call out AI content in comments ("this is AI
# generated", "obvious AI slop", "is this AI?"). That is a strong, cheap signal.
# The patterns below deliberately match *accusatory* phrasing, NOT any mention of
# AI — "I love AI", "I work in AI", "AI will change the world" must NOT trigger.

# Strong patterns: phrasing that asserts/asks the content itself is AI-made.
_STRONG_PATTERNS = [
    r"\bai[\s-]?generated\b",
    r"\bgenerated\s+(?:by|with|using)\s+(?:an?\s+)?ai\b",
    r"\b(?:made|created|drawn|written|produced)\s+(?:by|with|using)\s+(?:an?\s+)?ai\b",
    r"\bthis\s+is\s+(?:clearly\s+|obviously\s+|so\s+|just\s+|totally\s+|100%\s+)?ai\b",
    r"\bis\s+this\s+(?:ai|ai[\s-]?generated)\b",
    r"\bai\s+slop\b",
    r"\b(?:obviously|clearly|definitely|totally|100%)\s+(?:an?\s+)?ai\b",
    r"\b(?:made|created|generated|drawn|written)\s+(?:by|with|in|using)?\s*"
    r"(?:chatgpt|midjourney|dall[\s-]?e|stable\s+diffusion|sora)\b",
    r"\bdeepfake\b",
]

# Weak patterns: suggestive but not conclusive; need corroboration. Bare tool
# names live here so "I use ChatGPT" doesn't trigger on its own.
_WEAK_PATTERNS = [
    r"\bai\s+art\b",
    r"\b(?:looks|seems|feels)\s+(?:like\s+)?ai\b",
    r"\bai\s+(?:image|picture|photo|video|content|writing|garbage|trash)\b",
    r"\b(?:chatgpt|midjourney|dall[\s-]?e|stable\s+diffusion)\b",
]

# Negations that flip an accusation ("this isn't AI", "I don't think this is AI").
_NEGATION = re.compile(
    r"(?:\bnot\b|n't|\bno\b|\bdon'?t\s+think\b|\bdoubt\b|\bisn'?t\b|\baren'?t\b)",
    re.IGNORECASE,
)

_STRONG = [re.compile(p, re.IGNORECASE) for p in _STRONG_PATTERNS]
_WEAK = [re.compile(p, re.IGNORECASE) for p in _WEAK_PATTERNS]

# A match is ignored if a negation appears within this many chars before it.
_NEGATION_WINDOW = 18


@dataclass
class CommentSignal:
    triggered: bool
    strong_hits: int
    weak_hits: int
    score: float  # 0..1 AI-probability contribution
    examples: list[str]


def _is_negated(text: str, start: int) -> bool:
    window = text[max(0, start - _NEGATION_WINDOW) : start]
    return bool(_NEGATION.search(window))


def _count(text: str, patterns: list[re.Pattern[str]]) -> tuple[int, list[str]]:
    hits = 0
    examples: list[str] = []
    for pattern in patterns:
        for match in pattern.finditer(text):
            if _is_negated(text, match.start()):
                continue
            hits += 1
            if len(examples) < 5:
                examples.append(match.group(0).strip().lower())
    return hits, examples


def detect_ai_accusations(text: str) -> CommentSignal:
    """Scan text (typically comments) for users calling the content AI-made.

    Triggers on a single strong accusation or at least two weak ones — never on
    an isolated, benign mention of AI. Returns a probability contribution.
    """
    if not text:
        return CommentSignal(False, 0, 0, 0.0, [])

    strong_hits, strong_ex = _count(text, _STRONG)
    weak_hits, weak_ex = _count(text, _WEAK)

    triggered = strong_hits >= 1 or weak_hits >= 2
    if not triggered:
        return CommentSignal(False, strong_hits, weak_hits, 0.0, [])

    if strong_hits >= 1:
        # Base 0.7, rising with corroborating mentions, capped below certainty.
        score = min(0.95, 0.7 + 0.06 * (strong_hits - 1) + 0.03 * weak_hits)
    else:
        score = min(0.75, 0.55 + 0.05 * (weak_hits - 2))

    return CommentSignal(
        triggered=True,
        strong_hits=strong_hits,
        weak_hits=weak_hits,
        score=round(score, 4),
        examples=(strong_ex + weak_ex)[:5],
    )
