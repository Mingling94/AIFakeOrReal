#!/usr/bin/env python3
"""Render the redesigned verdict-first popup UI from real API data."""
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

# Design system colors
HUMAN_GREEN = (34, 197, 94)
MIXED_AMBER = (245, 158, 11)
AI_RED = (239, 68, 68)
UNKNOWN_SLATE = (148, 163, 184)
BG = (248, 250, 252)
CARD = (255, 255, 255)
DARK = (15, 23, 42)
TEXT = (51, 65, 85)
SUBDUED = (148, 163, 184)
BORDER = (226, 232, 240)
CHIP_POS_BG = (240, 253, 244)
CHIP_POS_FG = (22, 163, 74)
CHIP_NEG_BG = (254, 242, 242)
CHIP_NEG_FG = (220, 38, 38)
CHIP_NEU_BG = (241, 245, 249)
CHIP_NEU_FG = (100, 116, 139)
WHITE = (255, 255, 255)

for p in [
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]:
    if os.path.exists(p):
        font_xs = ImageFont.truetype(p, 11)
        font_sm = ImageFont.truetype(p, 12)
        font_md = ImageFont.truetype(p, 13)
        font_lg = ImageFont.truetype(p, 16)
        font_verdict = ImageFont.truetype(p, 22)
        break
else:
    font_xs = font_sm = font_md = font_lg = font_verdict = ImageFont.load_default()


def api_get(path: str) -> dict:
    with urllib.request.urlopen(f"{API}{path}", timeout=5) as resp:
        return json.loads(resp.read())


def seed(url: str, votes: list[str]) -> None:
    for v in votes:
        try:
            urllib.request.urlopen(
                urllib.request.Request(
                    f"{API}/vote",
                    json.dumps({"url": url, "vote": v}).encode(),
                    headers={"Content-Type": "application/json"},
                ),
                timeout=5,
            )
        except Exception:
            pass


def verdict_color(score: float | None) -> tuple[int, int, int]:
    if score is None:
        return UNKNOWN_SLATE
    if score <= 0.3:
        return HUMAN_GREEN
    if score <= 0.7:
        return MIXED_AMBER
    return AI_RED


def verdict_word(score: float | None) -> str:
    if score is None:
        return "NOT CHECKED YET"
    if score <= 0.3:
        return "HUMAN"
    if score <= 0.7:
        return "UNCLEAR"
    return "AI GENERATED"


def signal_chips(
    ai: float | None, crowd: float | None, votes: int
) -> list[tuple[str, str]]:
    if ai is None:
        return [("Not yet analyzed", "neutral")]
    chips = []
    if ai <= 0.3:
        chips.append(("Natural vocabulary", "positive"))
        chips.append(("Varied writing style", "positive"))
    elif ai <= 0.7:
        chips.append(("Some AI patterns", "neutral"))
    else:
        chips.append(("AI vocabulary detected", "negative"))
        chips.append(("Uniform structure", "negative"))
    if votes > 0 and crowd is not None:
        if crowd > 0.7:
            chips.append(("Users flagged as AI", "negative"))
        elif crowd < 0.3:
            chips.append(("Users say it's real", "positive"))
    return chips


def draw_popup(url: str, score_data: dict, vote_data: dict, path: str) -> None:
    domain = url.split("//")[-1].split("/")[0]
    combined = score_data.get("combined_score")
    ai_score = score_data.get("ai_score")
    crowd_score = score_data.get("crowd_score")
    confidence = score_data.get("confidence", "none")
    vote_count = score_data.get("vote_count", 0)
    total_votes = vote_data.get("total", 0)
    vc = verdict_color(combined)

    H = 440
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    y = 0

    # Zone A: Verdict Banner
    banner_h = 90
    draw.rectangle([0, 0, W, banner_h], fill=vc)
    draw.text(
        (W // 2, 22), verdict_word(combined), fill=WHITE, font=font_verdict, anchor="mt"
    )
    if combined is not None:
        pct_text = f"{int(round(combined * 100))}% AI probability"
        draw.text((W // 2, 50), pct_text, fill=(*WHITE[:3],), font=font_md, anchor="mt")
    draw.text((W // 2, 72), domain, fill=(255, 255, 255), font=font_xs, anchor="mt")
    y = banner_h

    # Zone B: Signal Chips
    y += 12
    draw.text((16, y), "WHY?", fill=SUBDUED, font=font_xs)
    y += 18

    chips = signal_chips(ai_score, crowd_score, vote_count)
    chip_x = 16
    for label, ctype in chips:
        if ctype == "positive":
            cbg, cfg = CHIP_POS_BG, CHIP_POS_FG
        elif ctype == "negative":
            cbg, cfg = CHIP_NEG_BG, CHIP_NEG_FG
        else:
            cbg, cfg = CHIP_NEU_BG, CHIP_NEU_FG

        tw = font_xs.getbbox(label)[2] + 16
        if chip_x + tw > W - 16:
            chip_x = 16
            y += 24
        draw.rounded_rectangle([chip_x, y, chip_x + tw, y + 20], radius=10, fill=cbg)
        draw.text((chip_x + 8, y + 4), label, fill=cfg, font=font_xs)
        chip_x += tw + 6

    y += 30

    # Confidence line
    conf_map = {
        "high": "High",
        "medium": "Moderate",
        "low": "Limited",
        "none": "No data",
    }
    conf_text = conf_map.get(confidence, "No data")
    if vote_count > 0:
        conf_text += f" · {vote_count} report{'s' if vote_count != 1 else ''}"
    draw.text((16, y), conf_text, fill=SUBDUED, font=font_sm)
    y += 24

    # Community votes bar (compact)
    if total_votes > 0:
        draw.text((16, y), "WHAT OTHERS THINK", fill=SUBDUED, font=font_xs)
        y += 16
        bar_w = W - 32
        bar_h = 6
        draw.rounded_rectangle(
            [16, y, 16 + bar_w, y + bar_h], radius=3, fill=CHIP_NEU_BG
        )
        x = 16
        for count, c in [
            (vote_data.get("human", 0), HUMAN_GREEN),
            (vote_data.get("mixed", 0), MIXED_AMBER),
            (vote_data.get("ai_generated", 0), AI_RED),
        ]:
            seg_w = int(bar_w * count / total_votes) if total_votes > 0 else 0
            if seg_w > 0:
                draw.rectangle([x, y, x + seg_w, y + bar_h], fill=c)
                x += seg_w
        y += 12
        bar_label = f"{vote_data.get('human', 0)} human · {vote_data.get('mixed', 0)} mixed · {vote_data.get('ai_generated', 0)} AI"
        draw.text((16, y), bar_label, fill=SUBDUED, font=font_xs)
        y += 22

    # Zone C: Actions bar
    draw.line([(0, y), (W, y)], fill=BORDER)
    y += 10

    # Scan button
    not_analyzed = ai_score is None
    btn_text = "Scan this page" if not_analyzed else "Re-scan"
    btn_bg = DARK if not_analyzed else BG
    btn_fg = WHITE if not_analyzed else SUBDUED
    btn_w = font_sm.getbbox(btn_text)[2] + 24
    draw.rounded_rectangle([16, y, 16 + btn_w, y + 28], radius=6, fill=btn_bg)
    draw.text(
        (16 + btn_w // 2, y + 14), btn_text, fill=btn_fg, font=font_sm, anchor="mm"
    )

    # Vote thumbs + Wrong?
    draw.text((W - 100, y + 6), "👍  👎", fill=SUBDUED, font=font_md)
    draw.text((W - 42, y + 8), "Wrong?", fill=SUBDUED, font=font_xs)
    y += 36

    # Details toggle
    draw.text((W // 2, y + 4), "See details ▼", fill=SUBDUED, font=font_xs, anchor="mt")

    img = img.crop((0, 0, W, min(y + 28, H)))
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
        "instagram_mixed",
        "https://www.instagram.com/",
        ["ai_generated"] * 3 + ["human"] * 3 + ["mixed"] * 2,
    ),
    ("no_data", "http://example.com/never-seen", []),
]

for name, url, votes in PAGES:
    print(f"→ {name}")
    seed(url, votes)
    try:
        s = api_get(f"/score?url={urllib.request.quote(url, safe='')}")
        v = api_get(f"/votes?url={urllib.request.quote(url, safe='')}")
    except Exception as e:
        print(f"  API: {e}")
        s = {
            "combined_score": None,
            "ai_score": None,
            "crowd_score": None,
            "confidence": "none",
            "vote_count": 0,
        }
        v = {"human": 0, "mixed": 0, "ai_generated": 0, "total": 0}

    path = os.path.join(OUT, f"{name}.png")
    draw_popup(url, s, v, path)
    print(f"  ✓ {name}.png ({os.path.getsize(path) // 1024}KB)")

print(f"\nDone → {OUT}")
