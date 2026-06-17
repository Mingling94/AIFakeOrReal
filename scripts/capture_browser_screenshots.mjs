/**
 * Capture browser screenshots of the extension popup against real pages.
 *
 * Uses Playwright's headless Firefox to render the popup preview harness
 * (which loads the real built popup bundle + API client) for each target URL.
 *
 * Usage: node scripts/capture_browser_screenshots.mjs
 * Prereqs: backend running on port 8000, extension built (npm run build)
 */

import { firefox } from "playwright";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "screenshots", "browser");
const HARNESS = path.join(ROOT, "extension", "devtools", "popup-preview.html");
const API = "http://127.0.0.1:8000/api/v1";

fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  {
    name: "reddit_ai_art",
    url: "https://www.reddit.com/r/aiArt/",
    label: "Reddit r/aiArt — AI-generated art subreddit",
  },
  {
    name: "youtube_human_video",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    label: "YouTube — Human music video (Rick Astley)",
  },
  {
    name: "bbc_news",
    url: "https://www.bbc.com/news",
    label: "BBC News — Human-written journalism",
  },
  {
    name: "instagram_feed",
    url: "https://www.instagram.com/",
    label: "Instagram — Social media feed",
  },
  {
    name: "generic_example",
    url: "http://example.com",
    label: "example.com — Generic page (no data)",
  },
];

async function seedVotes(url) {
  try {
    const votes = ["ai_generated", "human", "mixed", "ai_generated", "ai_generated"];
    for (const v of votes) {
      await fetch(`${API}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, vote: v }),
      });
    }
  } catch {
    // backend may be down; screenshots will show "no data" state
  }
}

async function main() {
  console.log("Launching headless Firefox...");
  const browser = await firefox.launch({ headless: true });

  for (const entry of PAGES) {
    console.log(`\n→ ${entry.label}`);

    // Seed some votes so the popup has data to display
    await seedVotes(entry.url);

    const page = await browser.newPage();
    await page.setViewportSize({ width: 420, height: 700 });

    // Load the popup preview harness with the target page URL
    const harnessUrl = `file://${HARNESS}?pageUrl=${encodeURIComponent(entry.url)}`;
    await page.goto(harnessUrl, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});

    // Wait for React render + API call
    await page.waitForTimeout(3000);

    const outPath = path.join(OUT, `${entry.name}.png`);
    await page.screenshot({ path: outPath, fullPage: true });
    const sizeKB = Math.round(fs.statSync(outPath).size / 1024);
    console.log(`  ✓ ${entry.name}.png (${sizeKB}KB)`);

    await page.close();
  }

  await browser.close();
  console.log(`\nAll screenshots saved to ${OUT}`);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
