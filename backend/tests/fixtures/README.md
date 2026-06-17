# Integration test fixtures

These mirror the shape of real, publicly available content so the
extraction → analysis → verdict pipeline can be tested deterministically
(no live network in CI).

Grounded in real public examples:

- `reddit_ai_post.json` — modeled on AI-art posts and the viral
  "Pope Francis in a white Balenciaga puffer jacket" image (an AI image that
  went viral in March 2023, originally posted to Reddit's r/midjourney). Such
  posts reliably draw comments identifying them as AI
  (e.g. r/aiArt: https://www.reddit.com/r/aiArt/).
- `reddit_human_post.json` — modeled on human photography posts on
  r/itookapicture (https://www.reddit.com/r/itookapicture/), whose comments
  praise composition and ask about gear, without AI accusations.

Reddit exposes any public post as JSON by appending `.json` to its URL, with no
authentication — the same endpoint our `RedditSource` uses. An opt-in live test
(`RUN_LIVE_TESTS=1`) exercises that real endpoint against an actual post.
