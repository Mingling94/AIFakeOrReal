# Deploy the API on Fly.io + Neon (near-free)

A step-by-step runbook to host the AI Fake Or Real backend for ~$0:

- **Compute:** Fly.io, one small machine that **scales to zero** when idle.
- **Database:** Neon, free serverless Postgres.

Everything the app needs is already in the repo: `server/Dockerfile`,
`server/fly.toml`, and idempotent schema migrations that run on boot.

> **App name / URL.** This guide assumes the Fly app is named **`aifakeorreal`**,
> giving the URL **`https://aifakeorreal.fly.dev`** — which is already baked into
> the extension (`manifest.*.json` `host_permissions` and `DEFAULT_API_URL`). If
> that name is taken, pick another and update those three places, then rebuild the
> extension. Pick the name **before** you publish the extension so you only build once.

---

## Prerequisites

- A [Fly.io](https://fly.io) account + `flyctl`:
  ```bash
  brew install flyctl      # or: curl -L https://fly.io/install.sh | sh
  fly auth login
  ```
- A [Neon](https://neon.tech) account.

---

## 1. Create the database (Neon)

1. In the Neon console, create a project (region near your Fly region, e.g. US West).
2. Copy the **pooled** connection string (the host contains `-pooler`). It looks like:
   ```
   postgresql://USER:PASSWORD@ep-xxx-pooler.us-west-2.aws.neon.tech/neondb?sslmode=require
   ```
   Keep `?sslmode=require` — Neon requires TLS, and the `postgres` client honors it.
3. That string is your `DATABASE_URL`. No manual schema setup — the server creates
   tables and runs migrations on first boot (`ensureSchema()`).

---

## 2. Launch the app (Fly)

From the repo root:

```bash
cd server
fly launch --no-deploy --copy-config --name aifakeorreal --region sea
```

- `--copy-config` uses the committed `fly.toml` (don't let it overwrite it).
- `--no-deploy` so we can set secrets first.
- If prompted to create a Postgres/Redis, **decline** — we use Neon.

---

## 3. Set secrets

```bash
fly secrets set \
  DATABASE_URL='postgresql://...-pooler...neon.tech/neondb?sslmode=require' \
  SECRET_KEY="$(openssl rand -hex 32)" \
  GEMINI_API_KEY='your-gemini-key'
```

Notes:
- `NODE_ENV=production` and `PORT=8000` are already set in `fly.toml` `[env]`.
- Add any other provider keys you have (`GROQ_API_KEY`, `OPENAI_API_KEY`, …) the same way.
- `VOTER_SALT` is optional (defaults to `SECRET_KEY`).
- Secrets are encrypted and injected as env vars; they don't live in the repo.

---

## 4. Deploy

```bash
fly deploy
```

Fly builds the Dockerfile, boots a machine, runs the health check on `/health`.

---

## 5. Verify

```bash
curl https://aifakeorreal.fly.dev/health           # {"status":"ok","database":true}
curl https://aifakeorreal.fly.dev/api/v1/providers # which LLM providers are configured
curl "https://aifakeorreal.fly.dev/api/v1/score?url=https://chatgpt.com"  # cold-start seed → high ai_score
```

Load the extension and open the popup on a page — it should hit the new host.

---

## 6. Rebuild the extension (already pointed at the new URL)

The manifests and `DEFAULT_API_URL` already target `aifakeorreal.fly.dev`. Rebuild
and repackage so the zips match:

```bash
cd extension && npm run build:all
cd .. && rm -f aifakeorreal-chrome.zip aifakeorreal-firefox.zip
( cd extension/dist && zip -rq -X ../../aifakeorreal-chrome.zip . )
( cd extension/dist-firefox && zip -rq -X ../../aifakeorreal-firefox.zip . )
```

Since the extension isn't published yet, there's nothing to migrate for users —
just submit these zips. (If it were already published, changing the API host
requires shipping a new extension version.)

---

## Cost & cold starts

- `fly.toml` sets `auto_stop_machines = "suspend"` + `min_machines_running = 0`, so
  the machine sleeps when idle and **resumes in well under a second** on the next
  request. Combined with the client-side local scanner and 1-week server cache,
  most requests never wake it.
- This keeps cost to roughly nothing at low traffic (Fly bills usage-based; Neon's
  tier is free). For **zero** cold starts, set `min_machines_running = 1` (small
  always-on cost) and redeploy.

## Optional: migrate existing data from Railway

Pre-launch you can just start fresh (the cache rebuilds; the cold-start seed covers
the obvious cases). If you want to carry over scores/votes:

```bash
pg_dump "$RAILWAY_DATABASE_URL" --no-owner --no-privileges -Fc -f afor.dump
pg_restore --no-owner --no-privileges -d "$NEON_DATABASE_URL" afor.dump
```

## Rollback

Railway still works (`server/railway.json`, `Procfile` are untouched). To fall back,
redeploy on Railway and point the manifests/`DEFAULT_API_URL` back to the Railway URL.
