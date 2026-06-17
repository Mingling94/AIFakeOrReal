#!/bin/bash
# Capture browser extension screenshots on real pages.
#
# Prerequisites:
#   1. Backend running: cd backend && DATABASE_URL=sqlite:///./demo.db python3 -m uvicorn app.main:app --port 8000
#   2. Extension loaded: chrome://extensions → Load unpacked → extension/dist
#
# This script opens pages, waits for you to click the extension popup and
# arrange the screenshot, then captures with macOS screencapture.
#
# Usage: ./scripts/capture_browser_screenshots.sh

set -e
OUT="docs/screenshots/browser"
mkdir -p "$OUT"

PAGES=(
  "https://www.reddit.com/r/aiArt/|reddit_ai_art"
  "https://www.reddit.com/r/itookapicture/|reddit_human_photo"
  "https://www.instagram.com/|instagram_feed"
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ|youtube_video"
  "https://www.facebook.com/|facebook_feed"
  "https://www.bbc.com/news|bbc_news"
)

echo "=== Browser Extension Screenshot Capture ==="
echo "Make sure the backend is running and the extension is loaded."
echo ""

for entry in "${PAGES[@]}"; do
  url="${entry%%|*}"
  name="${entry##*|}"

  echo "→ Opening: $url"
  open "$url"
  echo "  1. Wait for the page to load"
  echo "  2. Click the AI Fake Or Real extension icon to open the popup"
  echo "  3. Press ENTER here when ready to capture"
  read -r

  # Capture the focused window
  screencapture -w "$OUT/${name}.png"
  echo "  ✓ Saved: $OUT/${name}.png"
  echo ""
done

echo "=== Uploading to S3 ==="
python3 -m awscli s3 sync "$OUT/" "s3://aifakeorreal-assets/screenshots/browser/" \
  --content-type image/png --region us-west-2

echo ""
echo "=== Done ==="
echo "Screenshots available at:"
echo "  https://aifakeorreal-assets.s3.us-west-2.amazonaws.com/screenshots/browser/"
ls -la "$OUT/"
