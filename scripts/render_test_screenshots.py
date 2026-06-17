#!/usr/bin/env python3
"""Render pytest output as terminal-style PNG screenshots.

Used by CI to produce visual test evidence that gets uploaded to S3. Requires
Pillow (pip install Pillow). Outputs to docs/screenshots/.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

FONT_SIZE = 14
LINE_H = 18
PAD = 20
BG = (26, 26, 46)
WHITE = (220, 220, 220)
GREEN = (76, 175, 80)
RED = (244, 67, 54)
YELLOW = (255, 193, 7)
CYAN = (100, 200, 255)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(REPO_ROOT, "backend")
OUT = os.path.join(REPO_ROOT, "docs", "screenshots")
os.makedirs(OUT, exist_ok=True)

for path in [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/SFMono-Regular.otf",
]:
    if os.path.exists(path):
        font = ImageFont.truetype(path, FONT_SIZE)
        break
else:
    font = ImageFont.load_default()

CHAR_W = font.getbbox("M")[2]

ENV = {
    **os.environ,
    "DATABASE_URL": "sqlite://",
    "CACHE_TTL_SECONDS": "0",
    "RATE_LIMIT_ENABLED": "false",
}

TESTS = [
    (
        "ss1_summary",
        "Full Test Suite",
        [sys.executable, "-m", "pytest", "--tb=no", "-q"],
    ),
    (
        "ss2_live",
        "Live Platform Tests (YouTube, BBC, IG, FB, Reddit)",
        [
            sys.executable,
            "-m",
            "pytest",
            "tests/test_live_platforms.py",
            "-v",
            "--tb=no",
        ],
    ),
    (
        "ss3_integration",
        "Integration Tests (Real Reddit Content Fixtures)",
        [
            sys.executable,
            "-m",
            "pytest",
            "tests/test_integration_real_content.py",
            "-v",
            "--tb=no",
        ],
    ),
    (
        "ss4_signals",
        "AI Detection Signals (Vocabulary + Structure + Comments)",
        [
            sys.executable,
            "-m",
            "pytest",
            "tests/test_vocabulary_signal.py",
            "tests/test_structure_signal.py",
            "tests/test_comment_signal.py",
            "-v",
            "--tb=no",
        ],
    ),
    (
        "ss5_api",
        "API Endpoint Tests",
        [
            sys.executable,
            "-m",
            "pytest",
            "tests/test_api_auth.py",
            "tests/test_api_scores.py",
            "tests/test_api_votes.py",
            "tests/test_api_analysis.py",
            "tests/test_reports.py",
            "tests/test_public_check.py",
            "tests/test_keys.py",
            "tests/test_api_root.py",
            "-v",
            "--tb=no",
        ],
    ),
    (
        "ss6_security",
        "Security Tests (SSRF, Rate Limit, Validation, Passwords)",
        [
            sys.executable,
            "-m",
            "pytest",
            "tests/test_detection.py::TestAssertPublicHost",
            "tests/test_detection.py::TestExtractorSsrf",
            "tests/test_ratelimit.py",
            "tests/test_validation.py",
            "-v",
            "--tb=no",
        ],
    ),
]


def strip_noise(text: str) -> str:
    lines = []
    skip = False
    for line in text.splitlines():
        line = re.sub(r"\x1b\[[0-9;]*m", "", line)
        if "warnings summary" in line:
            skip = True
        if (
            skip
            and "====" in line
            and ("passed" in line or "failed" in line or "skipped" in line)
        ):
            skip = False
            lines.append(line)
            continue
        if skip:
            continue
        if any(
            s in line
            for s in [
                "PytestDeprecation",
                "asyncio_default",
                "DeprecationWarning",
                "StarletteDeprecation",
                "warnings.warn",
                "configfile:",
                "cachedir:",
                "plugins:",
                "asyncio: mode=",
                "rootdir:",
            ]
        ):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def line_color(line: str) -> tuple[int, int, int]:
    if "passed" in line and "==" in line:
        return GREEN
    if "failed" in line and "==" in line:
        return RED
    if line.startswith("#"):
        return CYAN
    return WHITE


def render(text: str, title: str, path: str) -> None:
    header = f"# {title}"
    all_lines = [header, ""] + text.splitlines()
    max_cols = min(max((len(l) for l in all_lines), default=40), 130)

    img_w = PAD * 2 + max_cols * CHAR_W
    img_h = PAD * 2 + len(all_lines) * LINE_H

    img = Image.new("RGB", (img_w, img_h), BG)
    draw = ImageDraw.Draw(img)

    for i, line in enumerate(all_lines):
        y = PAD + i * LINE_H
        base = CYAN if i == 0 else line_color(line)

        x = PAD
        remaining = line[:max_cols]
        while remaining:
            kw_match = None
            for kw, color in [("PASSED", GREEN), ("FAILED", RED), ("SKIPPED", YELLOW)]:
                if remaining.startswith(kw):
                    kw_match = (kw, color)
                    break
            if kw_match:
                draw.text((x, y), kw_match[0], fill=kw_match[1], font=font)
                x += CHAR_W * len(kw_match[0])
                remaining = remaining[len(kw_match[0]) :]
            else:
                next_kw = len(remaining)
                for kw in ["PASSED", "FAILED", "SKIPPED"]:
                    idx = remaining.find(kw)
                    if idx != -1 and idx < next_kw:
                        next_kw = idx
                chunk = remaining[:next_kw]
                draw.text((x, y), chunk, fill=base, font=font)
                x += CHAR_W * len(chunk)
                remaining = remaining[next_kw:]

    img.save(path)


for name, title, cmd in TESTS:
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=BACKEND, env=ENV)
    output = strip_noise(r.stdout + r.stderr)
    path = os.path.join(OUT, f"{name}.png")
    render(output, title, path)
    size = os.path.getsize(path) // 1024
    print(f"  {name}.png: {size}KB")

print("all screenshots rendered")
