from __future__ import annotations

import json
import os
import pathlib

import httpx
import pytest

from app.api.analysis import perform_analysis
from app.services import detection
from app.services.scoring import score_to_verdict
from app.services.sources import extract_content

FIXTURES = pathlib.Path(__file__).parent / "fixtures"


def _fixture_transport(payload: str) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=payload)

    return httpx.MockTransport(handler)


@pytest.fixture(autouse=True)
def _disable_ssrf(monkeypatch):  # type: ignore[no-untyped-def]
    # MockTransport handles the HTTP, but the SSRF guard would still do a real
    # DNS lookup; disable it so these stay fully offline.
    monkeypatch.setattr(detection.settings, "BLOCK_PRIVATE_FETCH", False)


class TestRealContentPipeline:
    @pytest.mark.asyncio
    async def test_ai_reddit_post_is_flagged(self, db) -> None:  # type: ignore[no-untyped-def]
        payload = (FIXTURES / "reddit_ai_post.json").read_text()
        url = "https://www.reddit.com/r/aiArt/comments/x/balenciaga_pope/"

        content = await extract_content(url, transport=_fixture_transport(payload))
        assert content.platform == "reddit"
        assert content.content_type == "image"
        assert len(content.comments) == 4

        url_score, extra = await perform_analysis(db, url, content=content)
        assert extra["analysis"]["comment_signal"]["triggered"] is True
        assert url_score.ai_score >= 0.7
        assert score_to_verdict(url_score.combined_score) == "ai_generated"

    @pytest.mark.asyncio
    async def test_human_reddit_post_is_not_flagged(self, db) -> None:  # type: ignore[no-untyped-def]
        payload = (FIXTURES / "reddit_human_post.json").read_text()
        url = "https://www.reddit.com/r/itookapicture/comments/y/misty_highlands/"

        content = await extract_content(url, transport=_fixture_transport(payload))
        assert content.platform == "reddit"
        assert len(content.comments) == 4

        url_score, extra = await perform_analysis(db, url, content=content)
        assert extra["analysis"]["comment_signal"]["triggered"] is False
        assert score_to_verdict(url_score.combined_score) != "ai_generated"


@pytest.mark.skipif(
    os.environ.get("RUN_LIVE_TESTS") != "1",
    reason="live network test; set RUN_LIVE_TESTS=1 to run",
)
class TestLiveReddit:
    """Hits Reddit's real public JSON API (no auth) — opt-in only."""

    @pytest.mark.asyncio
    async def test_real_reddit_endpoint_returns_posts(self) -> None:
        from app.services.detection import FetchError, safe_fetch

        try:
            raw = await safe_fetch("https://www.reddit.com/r/aiArt/top.json?limit=1")
        except FetchError as exc:
            # Reddit aggressively blocks non-OAuth requests from cloud IPs /
            # generic user agents (HTTP 403). That is environmental, not a code
            # bug — and is exactly why the extension prefers client-side
            # extraction. Skip rather than fail the suite.
            pytest.skip(f"Reddit blocked the request (expected from some hosts): {exc}")

        data = json.loads(raw)
        children = data["data"]["children"]
        assert children, "expected at least one post from a real subreddit"
        assert children[0]["data"].get("title")
