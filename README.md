# AI Fake Or Real

> Know if what you're reading was made by AI — a browser extension with LLM-powered detection, heuristic analysis, and crowdsourced voting.

## Features

- **One-glance badge** — green ✓ (Not AI), yellow ? (Unclear), or red AI on every tab
- **LLM-powered detection** — sends page text to OpenAI / Claude / Gemini with automatic failover
- **Local heuristic scanner** — instant, no network call, detects AI vocabulary and structural patterns
- **Crowdsourced voting** — vote 👍 Not AI or 👎 Is AI on any page
- **AI exposure tracking** — see what % of your browsing is AI content (1D/7D/30D/1Y)
- **Multi-platform** — Reddit, Instagram, Facebook, YouTube, TikTok, Twitter/X, and any website
- **Multi-browser** — Chrome, Edge, Brave, and Firefox

## How It Works

```
Page Load
  ├─► Local Scanner (instant) → badge updates immediately
  ├─► API Score (cached) → refines with crowd data
  └─► LLM Detection (on analysis) → OpenAI → Claude → Gemini failover
```

Three signals combine into a single 0–100% AI probability score:
1. **Heuristic scan** — AI vocabulary, structural uniformity, comment accusations
2. **LLM classification** — GPT-4o-mini / Claude Haiku / Gemini Flash (70% weight when available)
3. **Crowd votes** — community consensus, reputation-weighted

## Quick Start

### Backend

```bash
cd server
npm install
npm run build
npm start
# API at http://localhost:8000
```

Set API keys for LLM detection (any combination — the system fails over automatically):
```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=AI...
```

### Extension

```bash
cd extension
npm install
npm run build          # Chrome/Edge/Brave → dist/
npm run build:firefox  # Firefox → dist-firefox/
npm run build:all      # Both
```

Load unpacked:
- **Chrome:** `chrome://extensions` → Developer mode → Load unpacked → `extension/dist/`
- **Firefox:** `about:debugging` → Load Temporary Add-on → `extension/dist-firefox/manifest.json`

## Production Deployment

- **Backend:** Live on Railway at `https://loving-reverence-production.up.railway.app`
- **Database:** PostgreSQL (Railway managed)
- **Extension packages:** `aifakeorreal-chrome.zip` (108KB), `aifakeorreal-firefox.zip` (108KB)

Full deployment guide: **[docs/deployment.md](docs/deployment.md)**

## API

Base URL: `https://loving-reverence-production.up.railway.app/api/v1`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/score?url=` | Get AI score for a URL |
| POST | `/vote` | Submit a vote (30 req/min) |
| GET | `/votes?url=` | Vote breakdown |
| POST | `/analyze/content` | Analyze page content with LLM |
| GET | `/privacy` | Privacy policy |
| DELETE | `/my-data?url=` | GDPR: delete your votes |

Full API docs: **[docs/API.md](docs/API.md)**

## Project Structure

```
AIFakeOrReal/
├── extension/                    # Browser extension (MV3)
│   ├── src/
│   │   ├── background/           # Service worker (badge, caching, history)
│   │   ├── content/              # Content script (page readers, scanner, overlays)
│   │   ├── popup/                # React popup UI
│   │   ├── options/              # Settings page
│   │   └── common/               # Shared: API client, types, browser polyfill, history
│   ├── public/
│   │   ├── manifest.chrome.json
│   │   └── manifest.firefox.json
│   └── webpack.config.js
├── server/                       # Node.js/Fastify backend
│   └── src/
│       ├── routes/               # API routes (scores, votes, analysis, privacy)
│       ├── services/             # Scoring engine, LLM detection
│       ├── shared/               # Scanner, types (shared with extension)
│       └── db/                   # Drizzle ORM schema
├── tests/
│   └── integration/              # CDP-based popup integration tests
├── docs/
│   ├── deployment.md             # Deployment guide
│   ├── product.md                # Product overview
│   ├── API.md                    # API reference
│   ├── privacy-policy.md         # Privacy policy
│   └── chrome-web-store.md       # Store listing copy
├── aifakeorreal-chrome.zip       # Ready to submit
└── aifakeorreal-firefox.zip      # Ready to submit
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension | TypeScript, React 18, Webpack, Chrome MV3 |
| Backend | Node.js, Fastify, Drizzle ORM |
| Database | PostgreSQL 16 (Railway) |
| AI Detection | OpenAI GPT-4o-mini, Claude Haiku, Gemini Flash (failover) |
| Heuristics | Custom NLP scanner (vocabulary, structure, comments) |
| Hosting | Railway |

## Testing

```bash
# Unit tests
cd extension && npm test

# Integration tests (requires Chromium with extension loaded)
CDP_PORT=9224 node tests/integration/popup-integration.test.js
```

## License

MIT
