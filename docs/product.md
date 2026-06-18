# Product Overview

## What It Does

AI Fake Or Real is a browser extension and API that detects AI-generated content on any webpage. It combines three detection methods:

1. **Local heuristic scanner** — instant, runs in the browser with no network call. Detects AI vocabulary patterns, structural tells, and comment accusations.
2. **LLM-based detection** — sends page text to OpenAI/Claude/Gemini for classification. Higher accuracy than heuristics, with failover between providers.
3. **Crowd voting** — users vote whether content is AI or human. Votes are weighted by user reputation.

These three signals are combined into a single 0–100% AI probability score.

## User Experience

### Toolbar Badge
On every page load, the extension badge shows:
- **✓** (green) — Is Not AI (≤30% AI probability)
- **?** (amber) — Unclear (31–70%)
- **AI** (red) — Is AI (>70%)
- **—** (gray) — Not checked

The badge updates automatically — no user action needed.

### Popup (click the icon)
Shows:
- **Verdict banner** — "IS NOT AI" / "UNCLEAR" / "IS AI" with AI probability %
- **Why chips** — "Natural vocabulary", "AI vocabulary detected", "Uniform structure", etc.
- **Community votes** — vote bar + 👍👎 Wrong? buttons inline
- **Disagreement notice** — when scanner and crowd disagree
- **AI Exposure stats** — your browsing history AI percentage over 1D/7D/30D/1Y
- **Details panel** — local scan %, server AI score %, crowd score %, platform, content type

### Crowd Votes
The community section appears:
- Always when votes exist for the URL
- As a fallback when the scan confidence is low (score 31–70%)
- With an ⚡ disagreement notice when scanner and crowd contradict each other

### AI Exposure Tracking
Tracks what % of pages you visit contain AI content. Data is stored locally (never sent to server). Shows 4 time windows:
- **1D** — last 24 hours
- **7D** — last week
- **30D** — last month
- **1Y** — last year

Color-coded: green (< 20% AI), amber (20–50%), red (> 50%).

## Detection Pipeline

```
Page Load
  │
  ├─► Local Scanner (instant, no network)
  │   ├── Vocabulary analysis (tier1/tier2 AI words)
  │   ├── Structural analysis (em-dashes, contractions, repetition, tricolons)
  │   └── Comment accusation detection (with negation handling)
  │
  ├─► API Score Fetch (cached 1 hour)
  │   └── Server combines: AI score + crowd score → combined score
  │
  └─► LLM Detection (on analysis trigger)
      ├── Try: OpenAI GPT-4o-mini (free tier)
      ├── Fallback: Anthropic Claude Haiku
      └── Fallback: Google Gemini Flash
```

## Supported Platforms

| Platform | DOM Readers | Comments | Overlays |
|----------|------------|----------|----------|
| Reddit | ✅ Post titles, text, comments | ✅ Expanded | ✅ Post badges |
| Instagram | ✅ Captions, OG tags | ✅ Dialog comments | ✅ Post badges |
| Facebook | ✅ Posts, stories | ✅ Comment divs | ✅ Post badges |
| YouTube | ✅ Descriptions, comments | ✅ Comment sections | ✅ |
| TikTok | ✅ Captions, comments | ✅ | ✅ |
| Twitter/X | ✅ Tweets, threads | ✅ | ✅ |
| Generic | ✅ Article/main text | ❌ | ❌ |

## Multi-Browser Support

| Browser | Status | Package |
|---------|--------|---------|
| Chrome | ✅ Ready | `aifakeorreal-chrome.zip` |
| Edge | ✅ Ready (same zip) | `aifakeorreal-chrome.zip` |
| Brave | ✅ Ready (same zip) | `aifakeorreal-chrome.zip` |
| Firefox | ✅ Ready | `aifakeorreal-firefox.zip` |
| Safari | 🔧 Needs Xcode conversion | — |

## API

Base URL: `https://loving-reverence-production.up.railway.app/api/v1`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/score?url=` | Get combined score for a URL |
| POST | `/vote` | Submit a vote (rate limited: 30/min) |
| GET | `/votes?url=` | Get vote breakdown |
| POST | `/analyze?url=` | Trigger AI analysis (rate limited: 20/min) |
| POST | `/analyze/content` | Analyze extracted page content |
| GET | `/privacy` | Privacy policy summary |
| DELETE | `/my-data?url=` | GDPR: delete your votes |

Full API documentation: [docs/API.md](API.md)
