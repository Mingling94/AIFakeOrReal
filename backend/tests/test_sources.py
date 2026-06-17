from __future__ import annotations

import json

import httpx
import pytest

from app.services import sources
from app.services.sources import (
    OpenGraphSource,
    RedditSource,
    detect_platform,
    extract_content,
)


class TestDetectPlatform:
    def test_instagram(self) -> None:
        assert detect_platform("https://www.instagram.com/p/abc/") == "instagram"

    def test_instagram_reel(self) -> None:
        assert detect_platform("https://instagram.com/reel/xyz/") == "instagram"

    def test_facebook(self) -> None:
        assert detect_platform("https://www.facebook.com/user/videos/123") == "facebook"

    def test_fb_watch(self) -> None:
        assert detect_platform("https://fb.watch/abc/") == "facebook"

    def test_reddit(self) -> None:
        assert detect_platform("https://www.reddit.com/r/x/comments/a/t/") == "reddit"

    def test_youtube(self) -> None:
        assert detect_platform("https://youtu.be/abc") == "youtube"

    def test_tiktok(self) -> None:
        assert detect_platform("https://www.tiktok.com/@u/video/1") == "tiktok"

    def test_twitter_x(self) -> None:
        assert detect_platform("https://x.com/u/status/1") == "twitter"

    def test_generic(self) -> None:
        assert detect_platform("https://example.com/news/article") == "generic"


def _transport(handler) -> httpx.MockTransport:  # type: ignore[no-untyped-def]
    return httpx.MockTransport(handler)


class TestRedditSource:
    @pytest.fixture(autouse=True)
    def _no_ssrf(self, monkeypatch):  # type: ignore[no-untyped-def]
        monkeypatch.setattr(
            sources, "_assert_public_host", lambda h: None, raising=False
        )
        # safe_fetch lives in detection; disable its guard for these tests.
        from app.services import detection

        monkeypatch.setattr(detection.settings, "BLOCK_PRIVATE_FETCH", False)

    @pytest.mark.asyncio
    async def test_should_extract_text_post(self) -> None:
        payload = [
            {
                "data": {
                    "children": [
                        {
                            "data": {
                                "title": "My text post",
                                "selftext": "Some body text here.",
                                "author": "alice",
                                "is_video": False,
                            }
                        }
                    ]
                }
            }
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            assert request.url.path.endswith(".json")
            return httpx.Response(200, text=json.dumps(payload))

        result = await RedditSource(transport=_transport(handler)).extract(
            "https://www.reddit.com/r/test/comments/abc/my_text_post/"
        )
        assert result.platform == "reddit"
        assert result.content_type == "text"
        assert result.title == "My text post"
        assert "Some body text here" in result.text
        assert result.author == "alice"

    @pytest.mark.asyncio
    async def test_should_mark_video_post(self) -> None:
        payload = [
            {"data": {"children": [{"data": {"title": "vid", "is_video": True}}]}}
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, text=json.dumps(payload))

        result = await RedditSource(transport=_transport(handler)).extract(
            "https://www.reddit.com/r/test/comments/abc/vid/"
        )
        assert result.content_type == "video"

    @pytest.mark.asyncio
    async def test_should_raise_on_bad_json(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, text="not json")

        from app.services.detection import FetchError

        with pytest.raises(FetchError):
            await RedditSource(transport=_transport(handler)).extract(
                "https://www.reddit.com/r/test/comments/abc/x/"
            )


class TestOpenGraphSource:
    @pytest.fixture(autouse=True)
    def _no_ssrf(self, monkeypatch):  # type: ignore[no-untyped-def]
        from app.services import detection

        monkeypatch.setattr(detection.settings, "BLOCK_PRIVATE_FETCH", False)

    @pytest.mark.asyncio
    async def test_should_extract_open_graph(self) -> None:
        html = (
            "<html><head>"
            '<meta property="og:title" content="A Cool Reel" />'
            '<meta property="og:description" content="Check this out" />'
            '<meta property="og:video" content="https://cdn.example.com/v.mp4" />'
            '<meta property="og:site_name" content="Instagram" />'
            "</head><body><p>page body</p></body></html>"
        )

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, html=html)

        result = await OpenGraphSource(transport=_transport(handler)).extract(
            "https://www.instagram.com/reel/abc/", "instagram"
        )
        assert result.platform == "instagram"
        assert result.content_type == "reel"
        assert result.title == "A Cool Reel"
        assert "Check this out" in result.text
        assert "https://cdn.example.com/v.mp4" in result.media_urls

    @pytest.mark.asyncio
    async def test_generic_video_from_og_type(self) -> None:
        html = (
            "<html><head>"
            '<meta property="og:title" content="Vid" />'
            '<meta property="og:type" content="video.other" />'
            "</head><body></body></html>"
        )

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, html=html)

        result = await OpenGraphSource(transport=_transport(handler)).extract(
            "https://example.com/watch", "generic"
        )
        assert result.content_type == "video"


class TestExtractContentRouting:
    @pytest.fixture(autouse=True)
    def _no_ssrf(self, monkeypatch):  # type: ignore[no-untyped-def]
        from app.services import detection

        monkeypatch.setattr(detection.settings, "BLOCK_PRIVATE_FETCH", False)

    @pytest.mark.asyncio
    async def test_should_route_reddit_to_json(self) -> None:
        payload = [{"data": {"children": [{"data": {"title": "t", "selftext": "b"}}]}}]
        seen = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["path"] = request.url.path
            return httpx.Response(200, text=json.dumps(payload))

        result = await extract_content(
            "https://www.reddit.com/r/x/comments/a/t/", transport=_transport(handler)
        )
        assert result.platform == "reddit"
        assert seen["path"].endswith(".json")
