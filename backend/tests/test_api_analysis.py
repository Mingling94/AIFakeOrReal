from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.detection import FetchError

ARTICLE_CONTENT = {
    "title": "Article",
    "text": (
        "Artificial intelligence has become a transformative technology. "
        "The development of large language models opened new possibilities. "
        "Natural language processing enables machines to understand text. "
        "Deep learning architectures process vast amounts of data. "
        "Neural networks learn patterns and generalize to new situations. "
    ),
    "image_urls": [],
    "word_count": 40,
}


class TestAnalyzeUrl:
    def test_should_analyze_and_store_score(self, client: TestClient) -> None:
        with patch(
            "app.api.analysis.content_extractor.extract_from_url",
            new=AsyncMock(return_value=ARTICLE_CONTENT),
        ):
            resp = client.post(
                "/api/v1/analyze", params={"url": "http://example.com/article"}
            )

        assert resp.status_code == 200
        data = resp.json()
        assert "analysis" in data
        assert 0.0 <= data["analysis"]["overall"] <= 1.0
        assert data["content"]["title"] == "Article"

        score_resp = client.get(
            "/api/v1/score", params={"url": "http://example.com/article"}
        )
        assert score_resp.json()["ai_score"] is not None

    def test_should_return_error_for_unreachable_url(self, client: TestClient) -> None:
        with patch(
            "app.api.analysis.content_extractor.extract_from_url",
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
        assert "http or https" in resp.json()["detail"]

    def test_should_require_url_param(self, client: TestClient) -> None:
        resp = client.post("/api/v1/analyze")
        assert resp.status_code == 422


class TestGetAnalysis:
    def test_should_return_404_for_unanalyzed_url(self, client: TestClient) -> None:
        resp = client.get(
            "/api/v1/analysis", params={"url": "http://never-analyzed.example.com"}
        )
        assert resp.status_code == 404
        assert "No analysis found" in resp.json()["detail"]

    def test_should_return_analysis_after_analyze(self, client: TestClient) -> None:
        with patch(
            "app.api.analysis.content_extractor.extract_from_url",
            new=AsyncMock(return_value=ARTICLE_CONTENT),
        ):
            client.post(
                "/api/v1/analyze", params={"url": "http://example.com/analyzed"}
            )

        resp = client.get(
            "/api/v1/analysis", params={"url": "http://example.com/analyzed"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ai_score"] is not None
        assert data["content_type"] == "text"

    def test_should_require_url_param(self, client: TestClient) -> None:
        resp = client.get("/api/v1/analysis")
        assert resp.status_code == 422
