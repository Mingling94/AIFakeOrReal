# Cost & Scaling

How AI Fake Or Real stays cheap to run, where the ceilings are, and how it pays
for itself as it grows.

## The cost model

Most checks cost **nothing**, by design:

1. **Local-first.** In-feed badges, the hide/blur avoidance feature, and AI-exposure
   stats run as a client-side heuristic in the browser — zero server/LLM cost.
   (`extension/src/content/local-scanner.ts`, thresholds in `thresholds.ts`.)
2. **Aggressive caching.** A deep LLM analysis for a given URL is cached in the DB
   for `LLM_CACHE_TTL_MS` (default 1 week). The same URL is analyzed once and then
   reused across **all** users. Popular pages amortize to ~one call per week.
3. **Cold-start seed.** Known AI-generator domains (`knownGeneratorScore` in
   `services/scoring.ts`) return a confident verdict with **no LLM call** — the
   first visitor still gets a real answer, and the obvious cases never cost a cent.
4. **Free-tier providers + failover.** Eight providers, cheapest free tiers first
   (`services/llm-detection.ts`). At low volume the invoice is ~$0.

## Where the ceilings are (these bound reliability, not just cost)

- **Shared-key quota.** By default every user's deep analysis runs through the
  server's own provider keys, so all users share one rate/day limit. Caching absorbs
  repeats, but **cache misses** (new URLs) funnel through that shared quota. Failover
  across 8 providers raises the ceiling; it does not remove it.
- **Free-tier ToS.** Several providers restrict free tiers to non-production use.
  Running a public, monetized product on free dev keys risks key suspension — review
  each provider's terms before commercializing.
- **Free tiers aren't durable.** Providers tighten or remove them regularly.

## Levers (all env-tunable)

| Lever | Where | Effect |
|------|-------|--------|
| `LLM_CACHE_TTL_MS` | server env | ↑ = fewer LLM calls, staler results |
| Badge / avoidance thresholds | `extension/src/content/thresholds.ts` | precision vs recall on passive UI |
| `knownGeneratorScore` domain list | `services/scoring.ts` | more cold-start hits, fewer LLM calls |
| Per-route rate limits | `routes/*.ts` | abuse protection |

## How it pays for itself

1. **BYOK (shipped).** Users add their own provider keys in Settings and pick a
   preferred provider; their checks run on their own quota, off the shared keys.
   See the privacy policy for how keys are handled.
2. **Pro tier (planned).** A paid tier funds paid provider quota for users who want
   higher limits / priority / vision+video — never gating the core verdict. See
   [monetization-ideas.md](monetization-ideas.md).
3. **Self-hosted small model (future).** A self-hosted open text model could cut
   dependence on free tiers for the common text case.

## Rule of thumb

Local-first + cache + cold-start seed keep direct cost near zero at MVP scale. The
limiter as you grow is **free-tier quota/ToS, not your wallet** — land BYOK adoption
and the Pro tier *before* a growth spike, not after.
