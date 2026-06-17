# AI Fake Or Real — Developer API

Find out whether content at a URL is AI-generated, with **one HTTP call**. The
service combines automated analysis, a crowd-comment heuristic, and community
votes into a single verdict.

- **Base URL:** `http://localhost:8000/api/v1` (your deployment's host in prod)
- **Interactive docs:** `/docs` (Swagger UI) and `/redoc`
- **Auth:** optional API key via the `X-API-Key` header
- **Price:** free today. High-volume usage may be metered/billed later, which is
  why attributing calls with an API key now is recommended.

---

## Quick start

```bash
# 1. (optional) create a free API key
curl -X POST http://localhost:8000/api/v1/keys -H 'Content-Type: application/json' \
  -d '{"name":"my-app"}'
# -> {"api_key":"afor_xxx","prefix":"afor_xx","tier":"free","name":"my-app"}

# 2. check a URL
curl "http://localhost:8000/api/v1/check?url=https://www.reddit.com/r/aiArt/comments/abc/x/" \
  -H "X-API-Key: afor_xxx"
```

```json
{
  "url": "https://www.reddit.com/r/aiArt/comments/abc/x/",
  "platform": "reddit",
  "content_type": "image",
  "verdict": "ai_generated",
  "ai_probability": 0.82,
  "confidence": "high",
  "analyzed": true,
  "votes": {"human": 3, "mixed": 5, "ai_generated": 42, "total": 50},
  "signals": {"ai_score": 0.78, "crowd_score": 0.85}
}
```

---

## The one endpoint you need: `GET /check`

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | string (required) | — | The content URL to check. Must be http/https. |
| `analyze` | boolean | `false` | Run (or refresh) AI analysis inline if not already done. |

**Response (`CheckResponse`):**

| Field | Type | Meaning |
|-------|------|---------|
| `verdict` | string | `human`, `mixed`, `ai_generated`, or `unknown` |
| `ai_probability` | float \| null | Combined score, 0 (human) → 1 (AI), or null if unknown |
| `confidence` | string | `none`, `low`, `medium`, `high` (grows with vote count) |
| `analyzed` | bool | Whether AI analysis has run for this URL |
| `platform` | string | `reddit`, `instagram`, `facebook`, `youtube`, `tiktok`, `twitter`, `generic` |
| `content_type` | string | `text`, `image`, `video`, `reel`, `story`, `post`, `unknown` |
| `votes` | object | `{human, mixed, ai_generated, total}` |
| `signals` | object | `{ai_score, crowd_score}` — the two raw inputs |

**Verdict thresholds** (on `ai_probability`): `≤0.30` → human, `≤0.70` → mixed,
`>0.70` → ai_generated, `null` → unknown.

### Fast vs. fresh
- Default (`analyze=false`): returns the cached result + current votes. Fast,
  cheap, ideal for high-volume lookups.
- `analyze=true`: fetches and analyzes the content inline. Slower; rate-limited
  more tightly. Use when you need a result for a URL nobody has analyzed yet.

---

## How the verdict is computed

1. **AI analysis** — content is fetched (platform-aware, see below) and scored
   with stylometric heuristics (perplexity, burstiness, vocabulary richness,
   sentence uniformity).
2. **Comment accusation heuristic** — public comments are scanned for users
   calling the content AI ("this is AI generated", "obvious AI slop", "is this
   AI?"). This is deliberately precise: a benign mention like "I love AI" or "I
   use ChatGPT" does **not** trigger it, and negations ("this isn't AI") are
   ignored. A clear accusation raises the AI score.
3. **Crowd votes** — community votes via the extension/app.
4. **Combination** — AI and crowd signals are blended with weights that shift
   toward the crowd as more votes accumulate.

---

## Platform support

| Platform | How content is read | Notes |
|----------|--------------------|-------|
| Reddit | Public `.json` API (post + comments) | Richest signal incl. comment accusations |
| Instagram (posts, reels, stories, video) | Open Graph metadata | Public preview text/media; full captions may be behind login |
| Facebook (videos, photos, posts, reels) | Open Graph metadata | Same caveat as Instagram |
| YouTube / TikTok / X (Twitter) | Open Graph metadata | Title/description/media type |
| Most other sites | Open Graph + page text | Generic fallback |

> Instagram/Facebook deep content (full captions, all comments) requires their
> official APIs with app credentials; that is a planned enhancement. Today we
> extract publicly available link-preview metadata plus any visible text.

---

## API keys & usage

| Endpoint | Description |
|----------|-------------|
| `POST /keys` | Create a free key. Returns the secret **once** — store it. |
| `GET /keys/usage` | Returns `{prefix, tier, name, request_count, created_at}` for the key in `X-API-Key`. |

Keys are optional for `/check`. Sending one attributes usage to you and is
required if/when usage-based pricing is introduced. Keys are stored only as a
hash; the raw value cannot be recovered.

---

## Rate limits

Per client IP, fixed window (defaults; configurable per deployment):

| Endpoint | Limit |
|----------|-------|
| `/check` | 120 / min |
| `/vote` | 30 / min |
| `/analyze` | 10 / min |

Exceeding a limit returns `429` with a `Retry-After` header.

## Errors

| Status | Meaning |
|--------|---------|
| `422` | Invalid URL (bad scheme, missing host, too long) |
| `401` | Invalid/missing API key (when one is supplied or required) |
| `429` | Rate limit exceeded |

## Other endpoints

`GET /score`, `POST /vote`, `GET /votes`, `POST /analyze`, `GET /analysis`,
`POST /scores/batch`, and `POST /auth/*` are documented in `/docs`. For most
integrations, `GET /check` is all you need.
