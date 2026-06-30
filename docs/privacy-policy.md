# Privacy Policy — AI Fake Or Real

**Last updated:** June 2026

## What we collect

- **URL hashes:** When you open the popup or look up a score, we send a SHA-256 hash of the page URL to our server to look up or store the AI detection score. We do NOT send the full URL unless you trigger a full analysis.
- **Page content for analysis:** When analysis runs (you open the popup on an unanalyzed page, click "Scan", or "Re-scan"), the extension reads the visible text, comments, and image URLs on the page you're viewing and sends them to our server, which forwards them to AI providers for classification (see *Third-party AI providers* below). This content is processed for analysis and not stored permanently.
- **Votes and reports:** If you vote (👍 Real / 👎 AI Fake) or report an incorrect verdict, we store the vote/report with the URL hash. If you're logged in it's linked to your account; otherwise we store a one-way hash of your IP address + user-agent solely to prevent duplicate anonymous voting. We do not store your raw IP.
- **API key usage:** If you use the public API with a key, we count the number of requests for usage tracking.

## What we do NOT collect

- **Browsing history:** We do NOT track which pages you visit. AI exposure stats (1D/7D/30D/1Y) are computed and stored locally in your browser and never leave your device. The extension only contacts our server when you interact with it (open the popup, scan, vote, or report).
- **Personal information:** No names, emails, or identifying information is collected unless you create an account (optional, only for weighted voting).
- **Cookies or tracking:** We do not use cookies, analytics trackers, or third-party tracking services in the extension.

## In-page scanning is local

The passive in-feed badges and the hide/blur "avoidance" feature use a **local, client-side heuristic** that runs entirely in your browser with **no data sent to any server**. Only the deeper analysis described above leaves your device, and only for the specific page you check. You can disable in-page scanning and avoidance in the extension's options.

## Third-party AI providers

When deep analysis runs, the page's text and/or image URLs are sent to one or more third-party AI services (e.g. Google Gemini, Groq, OpenAI, Anthropic, Mistral, Cohere, Together, Cloudflare) for classification. Their own privacy policies govern their processing. If you supply your own API keys ("bring your own keys") in the extension settings, those keys are stored locally in your browser and sent to our server only to make the request on your behalf; we do not store them.

## Data storage

Detection scores and vote counts are stored on our server associated with URL hashes (not full URLs). Account data (email, hashed password) is stored if you create an account. All data can be deleted on request.

## Selling data

We do not sell your data or use it for advertising. The only sharing is with the AI providers described above, solely to perform the analysis you requested.

## Contact

For questions about this privacy policy, open an issue at: https://github.com/Mingling94/AIFakeOrReal
