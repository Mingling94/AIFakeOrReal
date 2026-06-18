# Deployment Guide

## Architecture

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────┐
│  Browser Extension│─────▶│  Fastify Backend  │─────▶│  PostgreSQL  │
│  (React + TS)     │      │  /api/v1          │      └──────────────┘
└──────────────────┘      │                    │
                           │  LLM Detection    │─────▶ OpenAI / Claude / Gemini
                           └──────────────────┘      (free-tier, failover chain)
```

## Backend (Railway)

**Live URL:** `https://loving-reverence-production.up.railway.app`

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | (required) |
| `PORT` | Server port | `8000` |
| `HOST` | Bind address | `0.0.0.0` |
| `CORS_ORIGINS` | Comma-separated allowed origins | (chrome-extension + moz-extension auto-allowed) |

#### LLM Detection (set any combination — system auto-failovers)

| Variable | Provider | Free Tier | Supports |
|----------|----------|-----------|----------|
| `GEMINI_API_KEY` | Google Gemini Flash | 15 RPM, 1M tok/day | Text, Images, Video |
| `GROQ_API_KEY` | Groq (Llama 3.3 70B) | 30 RPM, 14.4K req/day | Text |
| `OPENAI_API_KEY` | OpenAI GPT-4o-mini | Limited free credits | Text, Images |
| `ANTHROPIC_API_KEY` | Anthropic Claude Haiku | Limited free credits | Text, Images |
| `MISTRAL_API_KEY` | Mistral Small | 1 RPM free | Text |
| `COHERE_API_KEY` | Cohere Command-R | 20 RPM free | Text |
| `TOGETHER_API_KEY` | Together AI (Llama) | $5 free credit | Text, Images |
| `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI | 10K req/day free | Text |

**Waterfall order:** Gemini → Groq → OpenAI → Anthropic → Mistral → Cohere → Together → Cloudflare. If none are configured, the system falls back to heuristic-only detection.

**Diagnostic endpoint:** `GET /api/v1/providers` shows which providers are configured and what content types they support.

### Deploy to Railway

1. Push to GitHub — Railway auto-deploys from `main`
2. Or manual deploy:
```bash
cd server
npm run build
railway up
```

### Health Check

```bash
curl https://loving-reverence-production.up.railway.app/health
# {"status":"ok","database":true}
```

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| `POST /api/v1/vote` | 30 req/min per IP |
| `POST /api/v1/analyze` | 20 req/min per IP |
| `DELETE /api/v1/my-data` | 10 req/min per IP |
| `GET` endpoints | No limit |

## Extension

### Chrome / Edge / Brave

**Package:** `aifakeorreal-chrome.zip` (108KB)

#### Chrome Web Store Submission
1. Go to https://chrome.google.com/webstore/devconsole
2. Pay $5 developer fee (one-time)
3. Click "New item" → upload `aifakeorreal-chrome.zip`
4. Fill in:
   - **Description:** Copy from `docs/chrome-web-store.md`
   - **Category:** Productivity
   - **Screenshots:** Upload from `tests/integration/screenshots/` (01-bbc, 04-reddit, 08-tiktok, 10-openai recommended)
   - **Privacy policy:** Paste from `docs/privacy-policy.md` or link to hosted version
5. Submit for review (1-3 business days)

#### Edge Add-ons
Same zip works. Submit at https://partner.microsoft.com/dashboard/microsoftedge/

#### Manual Install (development)
```bash
cd extension
npm install
npm run build
# chrome://extensions → Developer mode → Load unpacked → select extension/dist/
```

### Firefox

**Package:** `aifakeorreal-firefox.zip` (108KB)

#### Firefox AMO Submission
1. Go to https://addons.mozilla.org/developers/
2. Click "Submit a New Add-on"
3. Upload `aifakeorreal-firefox.zip`
4. Fill in listing details (same copy as Chrome)
5. Submit for review

#### Manual Install (development)
```bash
cd extension
npm install
TARGET=firefox npm run build
# about:debugging → Load Temporary Add-on → select extension/dist-firefox/manifest.json
```

### Safari

Requires Xcode and macOS:
```bash
xcrun safari-web-extension-converter extension/dist --project-location safari-extension
# Open the generated Xcode project and build
```

### Build Both Browsers

```bash
cd extension
npm run build:all    # builds dist/ (Chrome) and dist-firefox/ (Firefox)
```

## Database

PostgreSQL hosted on Railway (managed). Schema is auto-created on first server start via `ensureSchema()`.

### Tables
- `urls` — URL hashes, scores, analysis results
- `votes` — User votes (human/mixed/ai_generated)
- `users` — Registered users (optional auth)
- `api_keys` — API keys for programmatic access

### Backup
Railway provides automatic daily backups for PostgreSQL.

## Privacy & GDPR

- **Privacy policy:** `docs/privacy-policy.md`
- **Data deletion:** `DELETE /api/v1/my-data?url=<url>` removes user votes
- **Privacy info:** `GET /api/v1/privacy` returns machine-readable summary
- **Local data:** AI exposure history stored in `chrome.storage.local` only — never sent to server
- **No tracking:** No cookies, no analytics, no PII collection

## Testing

### Unit Tests
```bash
cd extension
npm test              # vitest — scanner and reader tests
```

### Integration Tests
Requires Chromium with the extension loaded and remote debugging enabled:
```bash
# Start Chromium
/Applications/Chromium.app/Contents/MacOS/Chromium \
  --remote-debugging-port=9224 \
  --user-data-dir=/tmp/chromium-aifr \
  --load-extension=$HOME/Github/AIFakeOrReal/extension/dist \
  "about:blank" &

# Run tests
CDP_PORT=9224 node tests/integration/popup-integration.test.js

# Run a single test
CDP_PORT=9224 node tests/integration/popup-integration.test.js --only "BBC"
```

Screenshots saved to `tests/integration/screenshots/`. HTML report at `tests/integration/screenshots-report.html`.

### Quick Popup Test
```bash
node test-popup.js https://www.bbc.com popup-bbc.png
```
