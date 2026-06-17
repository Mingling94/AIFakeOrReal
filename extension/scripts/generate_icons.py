#!/usr/bin/env python3
"""Generate placeholder extension icons with no third-party dependencies.

Produces a dark navy rounded square with a green->yellow->red gauge disc,
mirroring the app's Human / Mixed / AI color scheme. Run from anywhere:

    python3 extension/scripts/generate_icons.py
"""

from __future__ import annotations

import math
import os
import struct
import zlib

NAVY = (26, 26, 46)
GREEN = (76, 175, 80)
YELLOW = (255, 152, 0)
RED = (244, 67, 54)

SIZES = (16, 32, 48, 128)
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icons")


def _lerp(
    a: tuple[int, int, int], b: tuple[int, int, int], t: float
) -> tuple[int, int, int]:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _spectrum(t: float) -> tuple[int, int, int]:
    """t in [0,1]: green -> yellow -> red."""
    if t < 0.5:
        return _lerp(GREEN, YELLOW, t * 2)
    return _lerp(YELLOW, RED, (t - 0.5) * 2)


def _rounded_alpha(x: float, y: float, size: int, radius: float) -> int:
    """Anti-aliased alpha for a rounded square covering the canvas."""
    inset = size * 0.06
    lo, hi = inset, size - inset
    cx = min(max(x, lo + radius), hi - radius)
    cy = min(max(y, lo + radius), hi - radius)
    dist = math.hypot(x - cx, y - cy)
    if x < lo or x > hi or y < lo or y > hi:
        return 0
    edge = dist - radius
    if edge <= 0:
        return 255
    if edge >= 1.0:
        return 0
    return round(255 * (1.0 - edge))


def _pixel(x: float, y: float, size: int) -> tuple[int, int, int, int]:
    alpha = _rounded_alpha(x, y, size, radius=size * 0.18)
    if alpha == 0:
        return (0, 0, 0, 0)

    center = size / 2.0
    disc_r = size * 0.34
    dx, dy = x - center, y - center
    if math.hypot(dx, dy) <= disc_r:
        # Color by horizontal position across the disc: left green, right red.
        t = (dx + disc_r) / (2 * disc_r)
        r, g, b = _spectrum(max(0.0, min(1.0, t)))
        return (r, g, b, alpha)
    return (*NAVY, alpha)


def _write_png(path: str, size: int) -> None:
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0 (None) per scanline
        for x in range(size):
            raw.extend(_pixel(x + 0.5, y + 0.5, size))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        path = os.path.join(OUT_DIR, f"icon{size}.png")
        _write_png(path, size)
        print(f"wrote {os.path.relpath(path)} ({size}x{size})")


if __name__ == "__main__":
    main()
