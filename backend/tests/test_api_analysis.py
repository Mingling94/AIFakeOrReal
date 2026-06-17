from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.detection import FetchError
from app.services.sources import ExtractedContent

ARTICLE = ExtractedContent(
    platform="generic",
    content_type="text",
    title="Article",
    text=(
        "Artificial intelligence has become a transformative technology. "
        "The development of large language models opened new possibilities. "
        "Natural language processing enables machines to understand text. "
        "Deep learning architectures process vast amounts of data. "
        "Neural networks learn patterns and generalize to new situations. "
    ),
    author="Example",
    media_urls=[],
)


class TestAnalyzeUrl:
    def test_should_analyze_and_store_score(self, client: TestClient) -> None:
        with patch(
            "app.api.analysis.extract_content",
            new=AsyncMock(return_value=ARTICLE),
        ):
            resp = client.post(
                "/api/v1/analyze", params={"url": "http://example.com/article"}
            )

        assert resp.status_code == 200
        data = resp.json()
        assert 0.0 <= data["analysis"]["overall"] <= 1.0
        assert data["content"]["title"] == "Article"
        assert data["platform"] == "generic"

        score = client.get(
            "/api/v1/score", params={"url": "http://example.com/article"}
        ).json()
        assert score["ai_score"] is not None

    def test_should_return_error_for_unreachable_url(self, client: TestClient) -> None:
        with patch(
            "app.api.analysis.extract_content",
            new=AsyncMock(side_effect=FetchError("Connection refused")),
        ):
            resp = client.post(
                "/api/v1/analyze", params={"url": "http://unreachable.example.com"}
            )

        assert resp.status_code == 422
        assert "Could not fetch URL" in resp.json()["detail"]

    def test_should_reject_non_http_scheme(self, client: TestClient) -> None:
        resp = client.post("/api/v1/analyze", params={"url": "ftp://example.com/x"})
        assert resp.status_code == 422

    def test_should_require_url_param(self, client: TestClient) -> None:
        resp = client.post("/api/v1/analyze")
        assert resp.status_code == 422


class TestGetAnalysis:
    def test_should_return_404_for_unanalyzed_url(self, client: TestClient) -> None:
        resp = client.get(
            "/api/v1/analysis", params={"url": "http://never-analyzed.example.com"}
        )
        assert resp.status_code == 404

    def test_should_return_analysis_after_analyze(self, client: TestClient) -> None:
        with patch(
            "app.api.analysis.extract_content",
            new=AsyncMock(return_value=ARTICLE),
        ):
            client.post(
                "/api/v1/analyze", params={"url": "http://example.com/analyzed"}
            )

        resp = client.get(
            "/api/v1/analysis", params={"url": "http://example.com/analyzed"}
        )
        assert resp.status_code == 200
        assert resp.json()["ai_score"] is not None


class TestAnalyzeContent:
    def test_should_analyze_client_supplied_content(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/analyze/content",
            json={
                "url": "https://www.instagram.com/p/abc/",
                "content_type": "post",
                "title": "Sunset",
                "text": "A calm evening by the sea.",
                "comments": ["this is clearly AI generated", "obvious AI slop"],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["platform"] == "instagram"
        assert data["content"]["comment_count"] == 2
        assert data["analysis"]["comment_signal"]["triggered"] is True

        score = client.get(
            "/api/v1/score", params={"url": "https://www.instagram.com/p/abc/"}
        ).json()
        assert score["ai_score"] >= 0.7
        assert score["platform"] == "instagram"

    def test_should_reject_invalid_url(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/analyze/content",
            json={"url": "ftp://example.com", "text": "x"},
        )
        assert resp.status_code == 422

    def test_should_not_need_network(self, client: TestClient) -> None:
        # No mocking of any fetcher: proves analysis runs purely on the payload.
        resp = client.post(
            "/api/v1/analyze/content",
            json={"url": "https://www.facebook.com/u/posts/1", "text": "hello world"},
        )
        assert resp.status_code == 200
        assert resp.json()["platform"] == "facebook"


class TestCommentSignalIntegration:
    def test_comment_accusations_should_raise_ai_score(
        self, client: TestClient
    ) -> None:
        accused = ExtractedContent(
            platform="reddit",
            content_type="image",
            title="Cool sunset",
            text="Cool sunset",
            comments=[
                "this is clearly AI generated",
                "yeah obvious AI slop",
                "is this AI??",
            ],
        )
        with patch(
            "app.api.analysis.extract_content",
            new=AsyncMock(return_value=accused),
        ):
            resp = client.post(
                "/api/v1/analyze", params={"url": "http://example.com/accused"}
            )
        data = resp.json()
        assert data["analysis"]["comment_signal"]["triggered"] is True

        score = client.get(
            "/api/v1/score", params={"url": "http://example.com/accused"}
        ).json()
        assert score["ai_score"] >= 0.7
