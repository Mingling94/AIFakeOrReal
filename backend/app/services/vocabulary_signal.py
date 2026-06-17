from __future__ import annotations

import re
from dataclasses import dataclass, field

# Vocabulary and phrase patterns derived from the "How Not to Sound Like AI"
# checklist. Organized by tier (from the doc's severity ranking) and category.

# --- Tier 1: Worst Offenders (instant tells) ---
TIER1_WORDS = {
    "delve",
    "delving",
    "leverage",
    "utilize",
    "tapestry",
    "underscore",
    "pivotal",
    "multifaceted",
    "holistic",
    "seamless",
    "seamlessly",
    "groundbreaking",
    "transformative",
    "revolutionary",
    "facilitate",
    "empower",
    "harness",
    "foster",
    "cultivate",
    "bolster",
    "illuminate",
    "resonate",
    "nuance",
    "nuanced",
    "comprehensive",
    "compelling",
    "embark",
    "curated",
    "elevate",
    "calibrate",
    "democratize",
}

# --- Tier 2: Suspicious When Clustered ---
TIER2_WORDS = {
    "moreover",
    "furthermore",
    "additionally",
    "thus",
    "hence",
    "consequently",
    "paramount",
    "myriad",
    "plethora",
    "intricate",
    "profound",
    "endeavor",
    "meticulous",
    "meticulously",
    "inherently",
    "overarching",
    "actionable",
    "streamline",
    "synergy",
    "paradigm",
    "catalyst",
    "stakeholder",
    "salient",
    "albeit",
    "elucidate",
    "juxtaposition",
}

# --- Tier 3: Hype Words ---
TIER3_PHRASES = [
    r"\bstate[\s-]of[\s-]the[\s-]art\b",
    r"\bgame[\s-]changer\b",
    r"\bnext[\s-]level\b",
    r"\bcutting[\s-]edge\b",
    r"\bunmatched\s+excellence\b",
    r"\bbest[\s-]in[\s-]class\b",
    r"\bworld[\s-]class\b",
    r"\bpacks?\s+a\s+punch\b",
    r"\ba\s+testament\s+to\b",
]

# --- Dead Giveaway Phrases ---
SYCOPHANTIC = [
    r"you(?:'re| are)\s+absolutely\s+right",
    r"great\s+question",
    r"that'?s?\s+(?:a\s+)?(?:really\s+)?(?:insightful|fantastic)\s+(?:observation|point)",
    r"i'?d?\s+be\s+happy\s+to\s+help",
    r"i\s+hope\s+this\s+helps",
    r"feel\s+free\s+to\s+ask",
    r"is\s+there\s+anything\s+else\s+i\s+can\s+help",
]

OPENER_CLICHES = [
    r"in\s+today'?s?\s+fast[\s-]paced\s+world",
    r"in\s+the\s+ever[\s-]evolving\s+landscape",
    r"when\s+it\s+comes\s+to\b",
    r"in\s+a\s+world\s+where\b",
    r"whether\s+you'?re\s+a\s+beginner\s+or",
    r"let'?s?\s+face\s+it",
    r"imagine\s+a\s+scenario",
    r"picture\s+this",
]

FILLER_PHRASES = [
    r"it'?s?\s+important\s+to\s+note\s+that",
    r"it'?s?\s+worth\s+mentioning",
    r"it\s+bears\s+mentioning",
    r"this\s+highlights\s+the\s+importance\s+of",
    r"the\s+key\s+takeaway\s+is",
    r"generally\s+speaking",
    r"broadly\s+speaking",
    r"without\s+further\s+ado",
    r"in\s+light\s+of\s+this",
]

TRANSITION_CRUTCHES = [
    r"let'?s?\s+(?:dive\s+in|unpack\s+this|break\s+this\s+down)",
    r"let'?s?\s+take\s+a\s+closer\s+look",
    r"here'?s?\s+why\s+this\s+matters",
    r"now,?\s+let'?s?\s+explore",
    r"let'?s?\s+explore",
]

MARKETING_SLOP = [
    r"unlock\s+the\s+(?:power|potential)\s+of",
    r"navigate\s+the\s+(?:landscape|complexities)",
    r"revolutionizing\s+the\s+way",
    r"tap\s+into\s+the\s+potential",
    r"take\s+your\s+\w+\s+to\s+the\s+next\s+level",
    r"a\s+deeper\s+understanding\s+of",
    r"serves?\s+as\s+a\s+testament",
]

CONCLUSION_CRUTCHES = [
    r"\bin\s+conclusion\b",
    r"\bto\s+sum\s+up\b",
    r"\bin\s+summary\b",
    r"\bat\s+the\s+end\s+of\s+the\s+day\b",
    r"\bthe\s+bottom\s+line\s+is\b",
    r"\blet\s+me\s+recap\b",
]

_COMPILED_TIERS: dict[str, list[re.Pattern[str]]] = {}


def _get_phrase_patterns() -> dict[str, list[re.Pattern[str]]]:
    if not _COMPILED_TIERS:
        _COMPILED_TIERS["tier3"] = [re.compile(p, re.IGNORECASE) for p in TIER3_PHRASES]
        _COMPILED_TIERS["sycophantic"] = [
            re.compile(p, re.IGNORECASE) for p in SYCOPHANTIC
        ]
        _COMPILED_TIERS["opener"] = [
            re.compile(p, re.IGNORECASE) for p in OPENER_CLICHES
        ]
        _COMPILED_TIERS["filler"] = [
            re.compile(p, re.IGNORECASE) for p in FILLER_PHRASES
        ]
        _COMPILED_TIERS["transition"] = [
            re.compile(p, re.IGNORECASE) for p in TRANSITION_CRUTCHES
        ]
        _COMPILED_TIERS["marketing"] = [
            re.compile(p, re.IGNORECASE) for p in MARKETING_SLOP
        ]
        _COMPILED_TIERS["conclusion"] = [
            re.compile(p, re.IGNORECASE) for p in CONCLUSION_CRUTCHES
        ]
    return _COMPILED_TIERS


@dataclass
class VocabularySignal:
    triggered: bool
    tier1_count: int = 0
    tier2_count: int = 0
    phrase_count: int = 0
    density: float = 0.0
    score: float = 0.0
    examples: list[str] = field(default_factory=list)


def detect_ai_vocabulary(text: str) -> VocabularySignal:
    """Score text for AI-typical vocabulary and phrase density.

    Uses a tiered system from the "How Not to Sound Like AI" checklist:
    - Tier 1 words are strong individual signals
    - Tier 2 words are suspicious when clustered
    - Phrases (openers, fillers, transitions, marketing) are strong signals
    - The score is based on density: how many AI-tells per 100 words
    """
    if not text or len(text.split()) < 20:
        return VocabularySignal(triggered=False)

    words = text.lower().split()
    word_set = set(words)
    total_words = len(words)
    examples: list[str] = []

    # Count tier 1/2 word hits
    t1_hits = TIER1_WORDS & word_set
    t2_hits = TIER2_WORDS & word_set

    t1_count = sum(words.count(w) for w in t1_hits)
    t2_count = sum(words.count(w) for w in t2_hits)
    examples.extend(sorted(t1_hits)[:3])
    examples.extend(sorted(t2_hits)[:2])

    # Count phrase hits
    patterns = _get_phrase_patterns()
    phrase_count = 0
    for _category, pats in patterns.items():
        for pat in pats:
            matches = pat.findall(text)
            phrase_count += len(matches)
            if matches and len(examples) < 8:
                examples.append(matches[0].strip().lower()[:50])

    # Density: AI-tells per 100 words
    # Tier 1 words count as 2, tier 2 as 1, phrases as 3 (they're multi-word)
    weighted = t1_count * 2 + t2_count * 1 + phrase_count * 3
    density = (weighted / total_words) * 100 if total_words > 0 else 0

    # Score: 0..1 AI probability contribution
    # The doc says "5+ patterns stacking = AI alarm". We map density to score.
    if density < 0.5:
        score = density * 0.2  # very low density -> minimal signal
    elif density < 1.5:
        score = 0.1 + (density - 0.5) * 0.3
    elif density < 3.0:
        score = 0.4 + (density - 1.5) * 0.2
    else:
        score = min(0.9, 0.7 + (density - 3.0) * 0.05)

    triggered = (
        (t1_count >= 3) or (t1_count >= 1 and t2_count >= 3) or (phrase_count >= 2)
    )

    return VocabularySignal(
        triggered=triggered,
        tier1_count=t1_count,
        tier2_count=t2_count,
        phrase_count=phrase_count,
        density=round(density, 4),
        score=round(score, 4),
        examples=examples[:8],
    )
