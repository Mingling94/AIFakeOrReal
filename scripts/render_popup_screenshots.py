#!/usr/bin/env python3
"""Render pixel-accurate popup screenshots from real API data using Pillow.

Queries the live backend for each target URL's score/votes, then draws the
popup UI (header, score gauge, vote bar, community stats) exactly as the
extension would display it. Outputs to docs/screenshots/browser/.

Usage: python3 scripts/render_popup_screenshots.py
Prereqs: backend running on port 8000
"""
from __future__ import annotations

import math
import os
import urllib.request
import json

from PIL import Image, ImageDraw, ImageFont

API = "http://127.0.0.1:8000/api/v1"
OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "docs",
    "screenshots",
    "browser",
)
os.makedirs(OUT, exist_ok=True)

W = 400
NAVY = (26, 26, 46)
WHITE = (255, 255, 255)
BG = (250, 250, 250)
GREEN = (76, 175, 80)
YELLOW = (255, 152, 0)
RED = (244, 67, 54)
GRAY = (158, 158, 158)
LIGHT_GRAY = (238, 238, 238)
DARK = (51, 51, 51)
SUBDUED = (136, 136, 136)

for p in [
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/SFNSText.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]:
    if os.path.exists(p):
        font_sm = ImageFont.truetype(p, 12)
        font_md = ImageFont.truetype(p, 14)
        font_lg = ImageFont.truetype(p, 18)
        font_xl = ImageFont.truetype(p, 28)
        font_title = ImageFont.truetype(p, 16)
        break
else:
    font_sm = font_md = font_lg = font_xl = font_title = ImageFont.load_default()


def api_get(path: str) -> dict:
    req = urllib.request.Request(f"{API}{path}")
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read())


def seed_and_analyze(url: str, votes: list[str]) -> None:
    for v in votes:
        data = json.dumps({"url": url, "vote": v}).encode()
        req = urllib.request.Request(
            f"{API}/vote", data=data, headers={"Content-Type": "application/json"}
        )
        try:
            urllib.request.urlopen(req, timeout=5)
        except Exception:
            pass


def score_color(score: float | None) -> tuple[int, int, int]:
    if score is None:
        return GRAY
    if score <= 0.3:
        return GREEN
    if score <= 0.7:
        return YELLOW
    return RED


def score_label(score: float | None) -> str:
    if score is None:
        return "No Score"
    if score <= 0.3:
        return "Likely Human"
    if score <= 0.7:
        return "Mixed / Uncertain"
    return "Likely AI-Generated"


def draw_popup(url: str, score_data: dict, vote_data: dict, path: str) -> None:
    domain = url.split("//")[-1].split("/")[0]
    combined = score_data.get("combined_score")
    pct = int(round((combined or 0) * 100))
    color = score_color(combined)
    confidence = score_data.get("confidence", "none")
    platform = score_data.get("platform", "generic")

    human = vote_data.get("human", 0)
    mixed = vote_data.get("mixed", 0)
    ai = vote_data.get("ai_generated", 0)
    total = vote_data.get("total", 0)

    H = 520
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Header bar
    draw.rectangle([0, 0, W, 58], fill=NAVY)
    draw.text((W // 2, 16), "AI Fake Or Real", fill=WHITE, font=font_title, anchor="mt")
    draw.text((W // 2, 40), domain, fill=(180, 180, 200), font=font_sm, anchor="mt")

    # Score gauge (circle)
    cx, cy = W // 2, 145
    r = 55
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=LIGHT_GRAY, width=8)

    if combined is not None:
        arc_end = -90 + int(360 * combined)
        draw.arc([cx - r, cy - r, cx + r, cy + r], -90, arc_end, fill=color, width=8)

    pct_text = f"{pct}%" if combined is not None else "?"
    draw.text((cx, cy - 6), pct_text, fill=color, font=font_xl, anchor="mm")
    draw.text(
        (cx, cy + 22), score_label(combined), fill=SUBDUED, font=font_sm, anchor="mm"
    )

    # Confidence badge
    badge_text = f"{confidence} confidence" if confidence != "none" else "No data"
    badge_colors = {
        "none": LIGHT_GRAY,
        "low": (255, 243, 205),
        "medium": (209, 236, 241),
        "high": (212, 237, 218),
    }
    badge_bg = badge_colors.get(confidence, LIGHT_GRAY)
    draw.rounded_rectangle([cx - 55, 210, cx + 55, 226], radius=10, fill=badge_bg)
    draw.text((cx, 218), badge_text, fill=DARK, font=font_sm, anchor="mm")

    # Platform badge
    draw.text(
        (cx, 238), f"platform: {platform}", fill=SUBDUED, font=font_sm, anchor="mm"
    )

    # Vote buttons
    y_vote = 260
    draw.text((20, y_vote), "CAST YOUR VOTE", fill=SUBDUED, font=font_sm)
    y_vote += 22
    bw = (W - 60) // 3
    for i, (label, btn_color) in enumerate(
        [("Human", GREEN), ("Mixed", YELLOW), ("AI Gen", RED)]
    ):
        x = 20 + i * (bw + 10)
        draw.rounded_rectangle(
            [x, y_vote, x + bw, y_vote + 36],
            radius=6,
            fill=(*btn_color, 30),
            outline=btn_color,
            width=2,
        )
        draw.text(
            (x + bw // 2, y_vote + 18), label, fill=btn_color, font=font_md, anchor="mm"
        )

    # Community stats
    y_stats = 340
    draw.rounded_rectangle(
        [16, y_stats, W - 16, y_stats + 110],
        radius=8,
        fill=WHITE,
        outline=LIGHT_GRAY,
        width=1,
    )
    draw.text((28, y_stats + 10), "COMMUNITY VOTES", fill=SUBDUED, font=font_sm)
    draw.text(
        (28, y_stats + 28),
        f"{total} vote{'s' if total != 1 else ''}",
        fill=DARK,
        font=font_md,
    )

    # Vote bar
    bar_y = y_stats + 52
    bar_w = W - 60
    bar_h = 20
    draw.rounded_rectangle(
        [28, bar_y, 28 + bar_w, bar_y + bar_h], radius=10, fill=LIGHT_GRAY
    )
    if total > 0:
        x = 28
        for count, c in [(human, GREEN), (mixed, YELLOW), (ai, RED)]:
            seg_w = int(bar_w * count / total)
            if seg_w > 0:
                draw.rectangle([x, bar_y, x + seg_w, bar_y + bar_h], fill=c)
                if seg_w > 25:
                    draw.text(
                        (x + seg_w // 2, bar_y + bar_h // 2),
                        f"{int(count / total * 100)}%",
                        fill=WHITE,
                        font=font_sm,
                        anchor="mm",
                    )
                x += seg_w

    # Legend
    y_leg = bar_y + 28
    for i, (label, c, count) in enumerate(
        [("Human", GREEN, human), ("Mixed", YELLOW, mixed), ("AI", RED, ai)]
    ):
        x = 28 + i * 120
        draw.ellipse([x, y_leg, x + 8, y_leg + 8], fill=c)
        draw.text((x + 14, y_leg - 1), f"{label} ({count})", fill=SUBDUED, font=font_sm)

    # Report button
    draw.text(
        (W // 2, H - 20), "Report incorrect", fill=SUBDUED, font=font_sm, anchor="mm"
    )

    img.save(path)


PAGES = [
    (
        "reddit_ai_art",
        "https://www.reddit.com/r/aiArt/",
        ["ai_generated"] * 8 + ["human"] * 2 + ["mixed"],
    ),
    (
        "youtube_human",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        ["human"] * 10 + ["mixed"],
    ),
    ("bbc_news", "https://www.bbc.com/news", ["human"] * 7 + ["mixed"] * 2),
    (
        "instagram",
        "https://www.instagram.com/",
        ["ai_generated"] * 3 + ["human"] * 3 + ["mixed"] * 2,
    ),
    ("generic_no_data", "http://example.com/brand-new-page-never-seen", []),
]

for name, url, votes in PAGES:
    print(f"→ {name}: {url}")
    seed_and_analyze(url, votes)
    try:
        score = api_get(f"/score?url={urllib.request.quote(url, safe='')}")
        vote_breakdown = api_get(f"/votes?url={urllib.request.quote(url, safe='')}")
    except Exception as e:
        print(f"  WARN: API error: {e}")
        score = {"combined_score": None, "confidence": "none", "platform": "generic"}
        vote_breakdown = {"human": 0, "mixed": 0, "ai_generated": 0, "total": 0}

    path = os.path.join(OUT, f"{name}.png")
    draw_popup(url, score, vote_breakdown, path)
    print(f"  ✓ {name}.png ({os.path.getsize(path) // 1024}KB)")

print(f"\nAll popup screenshots saved to {OUT}")
