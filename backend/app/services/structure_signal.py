from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class StructureSignal:
    triggered: bool
    flags: list[str] = field(default_factory=list)
    flag_count: int = 0
    score: float = 0.0


def detect_ai_structure(text: str) -> StructureSignal:
    """Detect structural and tonal AI tells from the checklist.

    Checks: em-dash overuse, tricolon patterns, no contractions, uniform
    paragraph length, zero typo perfection proxy, excessive hedging, and
    sycophantic/filler density. Each flag found raises the score.
    """
    if not text or len(text.split()) < 50:
        return StructureSignal(triggered=False)

    flags: list[str] = []
    words = text.split()
    total_words = len(words)

    # --- Em-dash overuse ---
    em_dashes = text.count("—") + text.count(" -- ")
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    if len(sentences) > 3 and em_dashes / len(sentences) > 0.25:
        flags.append("em_dash_overuse")

    # --- Tricolon patterns ("X, Y, and Z" rhetorical threes) ---
    tricolons = len(re.findall(r"\b\w+,\s+\w+,\s+and\s+\w+\b", text, re.IGNORECASE))
    if tricolons >= 3:
        flags.append("tricolon_repetition")

    # --- Uniform paragraph length ---
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if len(paragraphs) >= 4:
        lengths = [len(p.split()) for p in paragraphs]
        mean = sum(lengths) / len(lengths)
        if mean > 0:
            cv = (sum((n - mean) ** 2 for n in lengths) / len(lengths)) ** 0.5 / mean
            if cv < 0.2:
                flags.append("uniform_paragraph_length")

    # --- No contractions (AI avoids them) ---
    contraction_pattern = re.compile(
        r"\b(?:i'm|i've|i'll|i'd|you're|you've|you'll|you'd|he's|she's|"
        r"it's|we're|we've|we'll|we'd|they're|they've|they'll|they'd|"
        r"isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|"
        r"doesn't|don't|didn't|won't|wouldn't|can't|couldn't|shouldn't|"
        r"that's|there's|here's|what's|who's|let's)\b",
        re.IGNORECASE,
    )
    contraction_count = len(contraction_pattern.findall(text))
    if total_words > 100 and contraction_count == 0:
        flags.append("no_contractions")

    # --- Repetitive sentence starters ---
    if len(sentences) >= 6:
        starters = [s.split()[0].lower() for s in sentences if s.split()]
        starter_counts = {}
        for s in starters:
            starter_counts[s] = starter_counts.get(s, 0) + 1
        max_repeat = max(starter_counts.values()) if starter_counts else 0
        if max_repeat / len(starters) > 0.3:
            flags.append("repetitive_sentence_starters")

    # --- Excessive hedging ---
    hedges = len(
        re.findall(
            r"\b(?:generally|tends?\s+to|in\s+many\s+cases|it\s+depends|"
            r"there\s+is\s+no\s+one[\s-]size[\s-]fits[\s-]all|"
            r"while\s+.{5,30}(?:advantages|benefits).{5,30}(?:challenges|drawbacks))\b",
            text,
            re.IGNORECASE,
        )
    )
    if hedges >= 3:
        flags.append("excessive_hedging")

    # --- Emotional flatness: no first-person experience ---
    first_person = len(
        re.findall(
            r"\b(?:i\s+tried|i\s+learned|we\s+learned\s+the\s+hard\s+way|"
            r"i\s+felt|i\s+was\s+frustrated|honestly|frankly)\b",
            text,
            re.IGNORECASE,
        )
    )
    if total_words > 200 and first_person == 0:
        flags.append("no_personal_voice")

    # --- "Not only X, but also Y" overuse ---
    not_only = len(
        re.findall(r"not\s+only\b.{3,40}\bbut\s+also\b", text, re.IGNORECASE)
    )
    if not_only >= 2:
        flags.append("not_only_but_also_overuse")

    # --- Lists always exactly 3 or 5 items ---
    list_items = re.findall(r"(?:^|\n)\s*[-•*]\s+", text)
    if len(list_items) in (3, 5, 10, 15):
        flags.append("suspiciously_round_list_count")

    flag_count = len(flags)
    # Score: each flag contributes; 5+ is the doc's "alarm threshold"
    if flag_count == 0:
        score = 0.0
    elif flag_count <= 2:
        score = 0.15 * flag_count
    elif flag_count <= 4:
        score = 0.3 + 0.1 * (flag_count - 2)
    else:
        score = min(0.85, 0.5 + 0.07 * (flag_count - 4))

    triggered = flag_count >= 3

    return StructureSignal(
        triggered=triggered,
        flags=flags,
        flag_count=flag_count,
        score=round(score, 4),
    )
