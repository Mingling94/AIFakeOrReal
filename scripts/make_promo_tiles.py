#!/usr/bin/env python3
"""Generate Chrome Web Store promo tiles for AI Fake Or Real.

Outputs (exact dims required by the Chrome Web Store):
  - docs/store-screenshots/promo/small-promo-440x280.png
  - docs/store-screenshots/promo/marquee-1400x560.png
"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON = os.path.join(ROOT, "icons", "icon-concept.png")
OUT = os.path.join(ROOT, "docs", "store-screenshots", "promo")
os.makedirs(OUT, exist_ok=True)

# Brand palette (from docs/index.html hero + icon background)
NAVY_A = (15, 23, 42)  # #0f172a
NAVY_B = (30, 41, 59)  # #1e293b
WHITE = (255, 255, 255)
SLATE = (148, 163, 184)  # #94a3b8
GREEN = (34, 197, 94)  # #22c55e
AMBER = (245, 158, 11)  # #f59e0b
RED = (239, 68, 68)  # #ef4444

BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
REG = "/System/Library/Fonts/SFNS.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def diagonal_gradient(w: int, h: int, a: tuple, b: tuple) -> Image.Image:
    """Smooth top-left -> bottom-right gradient."""
    base = Image.new("RGB", (w, h), a)
    top = Image.new("RGB", (w, h), b)
    mask = Image.new("L", (w, h))
    md = mask.load()
    for y in range(h):
        for x in range(w):
            md[x, y] = int(255 * ((x / w) + (y / h)) / 2)
    base.paste(top, (0, 0), mask)
    return base


def rounded_icon(size: int, radius_frac: float = 0.22) -> Image.Image:
    icon = Image.open(ICON).convert("RGBA").resize((size, size), Image.LANCZOS)
    r = int(size * radius_frac)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size, size], radius=r, fill=255)
    icon.putalpha(mask)
    return icon


def paste_icon_with_glow(canvas: Image.Image, icon: Image.Image, xy: tuple) -> None:
    x, y = xy
    s = icon.size[0]
    # soft glow behind the icon so it lifts off the navy bg
    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    pad = int(s * 0.06)
    gd.rounded_rectangle(
        [x - pad, y - pad, x + s + pad, y + s + pad],
        radius=int(s * 0.26),
        fill=(99, 102, 241, 70),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(int(s * 0.08)))
    canvas.alpha_composite(glow)
    canvas.alpha_composite(icon, (x, y))


def text_w(draw, s, f) -> int:
    box = draw.textbbox((0, 0), s, font=f)
    return box[2] - box[0]


def verdict_pills(img, x, y, scale=1.0):
    """Three signal pills: Real / Unclear / AI Fake.

    Drawn on a transparent overlay then composited, so translucent fills
    survive the final RGB flatten (drawing alpha directly on the base and
    converting to RGB turns faint fills opaque).
    """
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    items = [("Real", GREEN), ("Unclear", AMBER), ("AI Fake", RED)]
    fp = font(BOLD, int(23 * scale))
    h = int(46 * scale)
    dot = int(13 * scale)
    gap = int(16 * scale)
    pad_x = int(22 * scale)
    cx = x
    for label, color in items:
        tw = text_w(d, label, fp)
        w = dot + int(11 * scale) + tw + pad_x * 2
        d.rounded_rectangle(
            [cx, y, cx + w, y + h],
            radius=h // 2,
            fill=(255, 255, 255, 24),
            outline=(color[0], color[1], color[2], 235),
            width=2,
        )
        dy = y + (h - dot) // 2
        d.ellipse([cx + pad_x, dy, cx + pad_x + dot, dy + dot], fill=color)
        d.text(
            (cx + pad_x + dot + int(11 * scale), y + h // 2),
            label,
            font=fp,
            fill=WHITE,
            anchor="lm",
        )
        cx += w + gap
    img.alpha_composite(overlay)


def make_marquee():
    W, H = 1400, 560
    img = diagonal_gradient(W, H, NAVY_A, NAVY_B).convert("RGBA")
    draw = ImageDraw.Draw(img)

    # Right: icon
    isize = 380
    ix = W - isize - 90
    iy = (H - isize) // 2
    paste_icon_with_glow(img, rounded_icon(isize), (ix, iy))

    # Left: text block
    lx = 90
    f_title = font(BOLD, 92)
    f_tag = font(REG, 34)
    f_tag2 = font(REG, 26)

    title_y = 150
    draw.text((lx, title_y), "AI Fake Or Real", font=f_title, fill=WHITE)
    draw.text(
        (lx, title_y + 118), "See what's real in your feed.", font=f_tag, fill=SLATE
    )
    draw.text(
        (lx, title_y + 162),
        "Like an ad blocker, but for AI-generated content.",
        font=f_tag2,
        fill=(100, 116, 139),
    )
    verdict_pills(img, lx, title_y + 230, scale=1.15)

    img.convert("RGB").save(os.path.join(OUT, "marquee-1400x560.png"))


def make_small():
    W, H = 440, 280
    img = diagonal_gradient(W, H, NAVY_A, NAVY_B).convert("RGBA")
    draw = ImageDraw.Draw(img)

    isize = 116
    ix = (W - isize) // 2
    iy = 30
    paste_icon_with_glow(img, rounded_icon(isize), (ix, iy))

    f_title = font(BOLD, 38)
    f_tag = font(REG, 19)
    ty = iy + isize + 22
    tw = text_w(draw, "AI Fake Or Real", f_title)
    draw.text(((W - tw) // 2, ty), "AI Fake Or Real", font=f_title, fill=WHITE)
    tag = "See what's real in your feed."
    tw2 = text_w(draw, tag, f_tag)
    draw.text(((W - tw2) // 2, ty + 48), tag, font=f_tag, fill=SLATE)

    img.convert("RGB").save(os.path.join(OUT, "small-promo-440x280.png"))


if __name__ == "__main__":
    make_marquee()
    make_small()
    for name in ("marquee-1400x560.png", "small-promo-440x280.png"):
        p = os.path.join(OUT, name)
        print(name, Image.open(p).size)
