#!/usr/bin/env node
/**
 * Generate the Chrome Web Store promotional tile (440×280).
 * Uses Canvas API to create a compelling marketing banner.
 *
 * Usage: node tests/generate-promo-tile.js
 */

const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

// Check if canvas is available
try {
  require("canvas");
} catch {
  console.log("Install canvas first: npm install canvas");
  console.log("Or create the promo tile manually — specs below:");
  console.log("");
  console.log("  Size: 440×280 pixels");
  console.log("  Background: dark navy (#0f172a)");
  console.log("  Left side: 🥸 emoji (large), 'AI Fake Or Real' title");
  console.log("  Tagline: 'The internet\\'s lie detector' in muted text");
  console.log("  Right side: Three colored badges - ✓ Real (green), ? (amber), AI Fake (red)");
  console.log("  Bottom: 'Chrome · Firefox · Edge' in small text");
  process.exit(0);
}

const OUT = path.join(__dirname, "..", "docs", "store-screenshots", "promo-440x280.png");
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const W = 440, H = 280;
const canvas = createCanvas(W * 2, H * 2); // 2x for retina
const ctx = canvas.getContext("2d");
const s = 2; // scale factor

// Background
ctx.fillStyle = "#0f172a";
ctx.fillRect(0, 0, W * s, H * s);

// Subtle gradient overlay
const grad = ctx.createLinearGradient(0, 0, W * s, H * s);
grad.addColorStop(0, "rgba(34, 197, 94, 0.08)");
grad.addColorStop(0.5, "rgba(0, 0, 0, 0)");
grad.addColorStop(1, "rgba(239, 68, 68, 0.08)");
ctx.fillStyle = grad;
ctx.fillRect(0, 0, W * s, H * s);

// Title
ctx.fillStyle = "#ffffff";
ctx.font = `bold ${32 * s}px -apple-system, sans-serif`;
ctx.textAlign = "center";
ctx.fillText("🥸", W * s / 2, 70 * s);

ctx.font = `800 ${24 * s}px -apple-system, sans-serif`;
ctx.fillText("AI Fake Or Real", W * s / 2, 110 * s);

// Tagline
ctx.fillStyle = "#94a3b8";
ctx.font = `${13 * s}px -apple-system, sans-serif`;
ctx.fillText("The internet's lie detector for AI content", W * s / 2, 140 * s);

// Three badges
const badges = [
  { text: "✓ Real", color: "#22c55e", x: 100 },
  { text: "? Unclear", color: "#f59e0b", x: 220 },
  { text: "AI Fake", color: "#ef4444", x: 340 },
];

for (const b of badges) {
  const bx = b.x * s, by = 180 * s, bw = 90 * s, bh = 32 * s;
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.roundRect(bx - bw / 2, by - bh / 2, bw, bh, 16 * s);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${12 * s}px -apple-system, sans-serif`;
  ctx.fillText(b.text, bx, by + 5 * s);
}

// Browser support
ctx.fillStyle = "#475569";
ctx.font = `${11 * s}px -apple-system, sans-serif`;
ctx.fillText("Chrome · Firefox · Edge", W * s / 2, 245 * s);

// Save
const buf = canvas.toBuffer("image/png");
fs.writeFileSync(OUT, buf);
console.log(`Promo tile saved: ${OUT} (${(buf.length / 1024).toFixed(0)}KB)`);
