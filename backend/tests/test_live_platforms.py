"""Live integration tests that hit real public URLs.

These exercise the full extraction → analysis → verdict pipeline against actual
internet content. They are skipped by default (no network in CI). Run with:

    RUN_LIVE_TESTS=1 python -m pytest tests/test_live_platforms.py -v

Each test is designed to be resilient: if a platform blocks or changes its markup
the test skips rather than false-failing, since the finding is environmental
("platform X now blocks server-side scraping") rather than a code bug.
"""

from __future__ import annotations

import functools
import os

import pytest

from app.services.detection import FetchError
from app.services.sources import (
    detect_platform,
    extract_content,
)

_live_only = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_TESTS") != "1",
    reason="live network tests; set RUN_LIVE_TESTS=1",
)


def _skip_on_block(fn):  # type: ignore[no-untyped-def]
    """Wrap an async test to skip on FetchError (anti-bot / geo block)."""

    @functools.wraps(fn)
    async def wrapper(*args, **kwargs):  # type: ignore[no-untyped-def]
        try:
            await fn(*args, **kwargs)
        except (FetchError, Exception) as exc:
            if any(
                s in str(exc).lower()
                for s in ["403", "blocked", "refused", "timeout", "ssl"]
            ):
                pytest.skip(f"Platform blocked the request: {exc}")
            raise

    return wrapper


@_live_only
class TestYouTubeLive:
    """YouTube serves OG tags reliably to server-side requests."""

    @pytest.mark.asyncio
    @_skip_on_block
    async def test_should_extract_youtube_video_og(self) -> None:
        # Rick Astley — a stable, well-known, human-created video.
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        content = await extract_content(url)
        assert content.platform == "youtube"
        assert content.content_type == "video"
        assert "rick" in content.title.lower() or "never gonna" in content.title.lower()
        assert content.text  # OG description should be non-empty

    @pytest.mark.asyncio
    @_skip_on_block
    async def test_youtube_human_video_should_not_be_flagged_as_ai(self, db) -> None:  # type: ignore[no-untyped-def]
        from app.api.analysis import perform_analysis
        from app.services.scoring import score_to_verdict

        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        content = await extract_content(url)
        url_score, extra = await perform_analysis(db, url, content=content)
        verdict = score_to_verdict(url_score.combined_score)
        # A real music video description shouldn't trigger AI detection.
        assert verdict != "ai_generated"
        assert extra["analysis"]["comment_signal"]["triggered"] is False


@_live_only
class TestBBCNewsLive:
    """BBC serves OG metadata for articles."""

    @pytest.mark.asyncio
    @_skip_on_block
    async def test_should_extract_news_article(self) -> None:
        url = "https://www.bbc.com/news/technology-65139406"
        content = await extract_content(url)
        assert content.platform == "generic"
        assert "chatgpt" in content.title.lower() or "ai" in content.text.lower()

    @pytest.mark.asyncio
    @_skip_on_block
    async def test_news_article_should_not_be_flagged(self, db) -> None:  # type: ignore[no-untyped-def]
        from app.api.analysis import perform_analysis
        from app.services.scoring import score_to_verdict

        url = "https://www.bbc.com/news/technology-65139406"
        content = await extract_content(url)
        url_score, extra = await perform_analysis(db, url, content=content)
        verdict = score_to_verdict(url_score.combined_score)
        # A news article mentioning AI ≠ AI-generated content.
        assert extra["analysis"]["comment_signal"]["triggered"] is False
        assert verdict != "ai_generated"


class TestPlatformDetectionOnRealUrls:
    def test_youtube(self) -> None:
        assert (
            detect_platform("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "youtube"
        )
        assert detect_platform("https://youtu.be/dQw4w9WgXcQ") == "youtube"

    def test_reddit(self) -> None:
        assert (
            detect_platform("https://www.reddit.com/r/aiArt/comments/x/y/") == "reddit"
        )

    def test_instagram(self) -> None:
        assert detect_platform("https://www.instagram.com/p/CgLVX/") == "instagram"
        assert detect_platform("https://www.instagram.com/reel/CgLVX/") == "instagram"

    def test_facebook(self) -> None:
        assert detect_platform("https://www.facebook.com/u/posts/1") == "facebook"
        assert detect_platform("https://fb.watch/abc/") == "facebook"

    def test_tiktok(self) -> None:
        assert detect_platform("https://www.tiktok.com/@u/video/1") == "tiktok"

    def test_twitter(self) -> None:
        assert detect_platform("https://x.com/u/status/1") == "twitter"
        assert detect_platform("https://twitter.com/u/status/1") == "twitter"


class TestClientSuppliedContentPipeline:
    """Simulates what the extension does: extract client-side, post to backend.

    Uses realistic content modeled on actual social media posts.
    """

    @pytest.mark.asyncio
    async def test_instagram_ai_reel_with_accusations_flagged(self, db) -> None:  # type: ignore[no-untyped-def]
        from app.api.analysis import perform_analysis
        from app.services.scoring import score_to_verdict
        from app.services.sources import ExtractedContent

        # Modeled on a Midjourney reel where commenters call it out.
        content = ExtractedContent(
            platform="instagram",
            content_type="reel",
            title="Enchanted forest at dawn",
            text="Enchanted forest at dawn. The light filtering through the ancient trees.",
            comments=[
                "this is so obviously AI generated lol",
                "midjourney vibes, the hands are wrong",
                "AI slop flooding my feed now",
                "beautiful!!",
                "what filter is this?",
            ],
        )
        url_score, extra = await perform_analysis(
            db, "https://www.instagram.com/reel/fake_ai_test/", content=content
        )
        assert extra["analysis"]["comment_signal"]["triggered"] is True
        assert score_to_verdict(url_score.combined_score) == "ai_generated"

    @pytest.mark.asyncio
    async def test_facebook_human_photo_not_flagged(self, db) -> None:  # type: ignore[no-untyped-def]
        from app.api.analysis import perform_analysis
        from app.services.scoring import score_to_verdict
        from app.services.sources import ExtractedContent

        content = ExtractedContent(
            platform="facebook",
            content_type="image",
            title="Family reunion 2026",
            text="So grateful for this weekend with the whole family. "
            "Three generations together for the first time in years. "
            "Grandma made her famous pie and the kids ran around the yard all day.",
            comments=[
                "Love this! Miss you all!",
                "Grandma's pie is the best, save me a slice!",
                "The kids got so big! Great photo.",
                "When's the next reunion? We're in!",
            ],
        )
        url_score, extra = await perform_analysis(
            db, "https://www.facebook.com/user/photos/12345", content=content
        )
        assert extra["analysis"]["comment_signal"]["triggered"] is False
        assert score_to_verdict(url_score.combined_score) != "ai_generated"

    @pytest.mark.asyncio
    async def test_reddit_deepfake_video_flagged(self, db) -> None:  # type: ignore[no-untyped-def]
        from app.api.analysis import perform_analysis
        from app.services.scoring import score_to_verdict
        from app.services.sources import ExtractedContent

        content = ExtractedContent(
            platform="reddit",
            content_type="video",
            title="Celebrity interview that never happened",
            text="Celebrity interview that never happened",
            comments=[
                "this is a deepfake, clearly fake",
                "is this AI?? the mouth movements are off",
                "generated with some video AI tool, look at the artifacts",
                "wow that's scary realistic though",
            ],
        )
        url_score, extra = await perform_analysis(
            db,
            "https://www.reddit.com/r/deepfakes/comments/x/fake_interview/",
            content=content,
        )
        assert extra["analysis"]["comment_signal"]["triggered"] is True
        assert score_to_verdict(url_score.combined_score) == "ai_generated"
