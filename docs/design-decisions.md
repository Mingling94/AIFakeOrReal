# Design Decisions (June 17, 2026)

Locked decisions from the UX review. Reference these before implementing.

| # | Decision | Choice |
|---|----------|--------|
| 1 | Name | Keep "AI Fake Or Real" for now. Ideas tracked in naming-ideas.md |
| 2 | In-page overlays | On by default, opt-out per site |
| 3 | Auto-scan | Auto-scan visible viewport (client-side heuristics only, debounced). Backend call only on explicit "Scan" or popup open |
| 4 | Dark mode | Match host page theme (prefers-color-scheme + platform dark class) |
| 5 | Icon | 🕵️ detective/disguise emoji (future: robot in disguise suit) |
| 6 | Voting | Tiny thumbs in popup footer, no labels, never prompt |
| 7 | Monetization | Free for now. Ideas in monetization-ideas.md. Never in popup or overlays |

## Popup hierarchy

1. **Verdict banner** (50% of visual weight) — full-width colored, one word + percentage
2. **Signal chips** — why we reached this verdict, plain English
3. **Actions** (collapsed) — scan, vote thumbs, "Wrong?" report, expandable details
