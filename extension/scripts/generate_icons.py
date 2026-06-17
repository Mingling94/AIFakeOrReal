#!/usr/bin/env python3
"""Generate extension icons: detective/spy emoji on a dark rounded square.

The 🕵️ concept: a figure in a hat and coat, rendered as a simple silhouette
with a magnifying glass — conveying "investigating if content is real."

Uses Pillow for text rendering of the emoji glyph from Apple Color Emoji.
Falls back to a stylized detective silhouette if emoji rendering unavailable.
"""
from __future__ import annotations

import math
import os
import struct
import zlib

SIZES = (16, 32, 48, 128)
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icons")

# Colors
NAVY = (15, 23, 42)  # #0f172a — matches design system
GREEN = (34, 197, 94)  # #22c55e
AMBER = (245, 158, 11)  # #f59e0b
RED = (239, 68, 68)  # #ef4444
WHITE = (255, 255, 255)
LIGHT = (200, 210, 230)

try:
    from PIL import Image, ImageDraw, ImageFont

    def _make_icon(size: int) -> bytes:
        """Render detective silhouette with magnifying glass."""
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        pad = max(1, int(size * 0.06))
        r = max(1, int(size * 0.18))

        # Rounded square background
        draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=r, fill=NAVY)

        cx, cy = size / 2, size / 2
        s = size  # scale reference

        # Hat (wide brim)
        hat_y = int(cy - s * 0.22)
        hat_w = int(s * 0.36)
        hat_h = int(s * 0.08)
        draw.ellipse([cx - hat_w, hat_y - hat_h, cx + hat_w, hat_y + hat_h], fill=LIGHT)
        # Hat crown
        crown_w = int(s * 0.18)
        crown_h = int(s * 0.14)
        draw.rectangle(
            [cx - crown_w, hat_y - hat_h - crown_h, cx + crown_w, hat_y - hat_h + 2],
            fill=LIGHT,
        )

        # Face (circle)
        face_r = int(s * 0.12)
        face_cy = hat_y + int(s * 0.04)
        draw.ellipse(
            [cx - face_r, face_cy - face_r, cx + face_r, face_cy + face_r], fill=LIGHT
        )

        # Body (trapezoid coat)
        coat_top = face_cy + face_r
        coat_bot = int(cy + s * 0.32)
        coat_tw = int(s * 0.16)
        coat_bw = int(s * 0.26)
        draw.polygon(
            [
                (cx - coat_tw, coat_top),
                (cx + coat_tw, coat_top),
                (cx + coat_bw, coat_bot),
                (cx - coat_bw, coat_bot),
            ],
            fill=LIGHT,
        )

        # Coat lapel line
        if size >= 32:
            draw.line(
                [(cx, coat_top), (cx, coat_bot)], fill=NAVY, width=max(1, size // 32)
            )

        # Magnifying glass (right side, colored by verdict — green default)
        mg_cx = int(cx + s * 0.22)
        mg_cy = int(cy + s * 0.05)
        mg_r = int(s * 0.10)
        mg_handle = int(s * 0.08)

        # Glass circle
        draw.ellipse(
            [mg_cx - mg_r, mg_cy - mg_r, mg_cx + mg_r, mg_cy + mg_r],
            outline=GREEN,
            width=max(1, size // 16),
        )
        # Fill with slight green tint
        inner = max(1, mg_r - max(1, size // 16))
        draw.ellipse(
            [mg_cx - inner, mg_cy - inner, mg_cx + inner, mg_cy + inner],
            fill=(34, 197, 94, 60),
        )
        # Handle
        hx = mg_cx + int(mg_r * 0.7)
        hy = mg_cy + int(mg_r * 0.7)
        draw.line(
            [(hx, hy), (hx + mg_handle, hy + mg_handle)],
            fill=GREEN,
            width=max(1, size // 12),
        )

        import io

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    HAS_PIL = True

except ImportError:
    HAS_PIL = False

    def _write_png_raw(
        path: str, size: int, pixels: list[list[tuple[int, int, int, int]]]
    ) -> None:
        raw = bytearray()
        for row in pixels:
            raw.append(0)
            for r, g, b, a in row:
                raw.extend((r, g, b, a))

        def chunk(tag: bytes, data: bytes) -> bytes:
            return (
                struct.pack(">I", len(data))
                + tag
                + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
            )

        ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
        png = (
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + chunk(b"IEND", b"")
        )
        with open(path, "wb") as f:
            f.write(png)

    def _make_icon(size: int) -> bytes:
        # Fallback: simple colored circle on navy square (no PIL)
        pixels = [[(0, 0, 0, 0)] * size for _ in range(size)]
        pad = max(1, int(size * 0.06))
        radius = size * 0.18
        center = size / 2

        for y in range(size):
            for x in range(size):
                # Rounded square
                if pad <= x < size - pad and pad <= y < size - pad:
                    pixels[y][x] = (*NAVY, 255)

                # Green circle in center
                if math.hypot(x - center, y - center) < size * 0.3:
                    pixels[y][x] = (*GREEN, 255)

        import io, struct as st, zlib as zl

        raw = bytearray()
        for row in pixels:
            raw.append(0)
            for r, g, b, a in row:
                raw.extend((r, g, b, a))

        def chunk(tag, data):
            return (
                st.pack(">I", len(data))
                + tag
                + data
                + st.pack(">I", zl.crc32(tag + data) & 0xFFFFFFFF)
            )

        ihdr = st.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
        return (
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zl.compress(bytes(raw), 9))
            + chunk(b"IEND", b"")
        )


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        path = os.path.join(OUT_DIR, f"icon{size}.png")
        data = _make_icon(size)
        with open(path, "wb") as f:
            f.write(data)
        print(f"wrote {os.path.relpath(path)} ({size}x{size}, {len(data)//1024}KB)")


if __name__ == "__main__":
    main()
