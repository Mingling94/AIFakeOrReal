from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


class TestAnalyzeUrl:
    def test_should_analyze_and_store_score(self, client: TestClient) -> None:
        html = """
        <html><head><title>Article</title></head><body>
        <main>
        <p>Artificial intelligence has become a transformative technology in recent years.
        The development of large language models has opened new possibilities for automation.
        Natural language processing enables machines to understand human communication.
        Deep learning architectures process vast amounts of data efficiently.
        Neural networks learn patterns from examples and generalize to new situations.</p>
        </main>
        </body></html>
        """
        mock_response = AsyncMock()
        mock_response.text = html
        mock_response.raise_for_status = lambda: None

        with patch("app.services.detection.httpx.AsyncClient") as mock_client:
            instance = AsyncMock()
            instance.get.return_value = mock_response
            instance.__aenter__.return_value = instance
            instance.__aexit__.return_value = None
            mock_client.return_value = instance

            resp = client.post(
                "/api/v1/analyze", params={"url": "http://example.com/article"}
            )

        assert resp.status_code == 200
        data = resp.json()
        assert "analysis" in data
        assert "overall" in data["analysis"]
        assert 0.0 <= data["analysis"]["overall"] <= 1.0
        assert data["content"]["title"] == "Article"
        assert data["content"]["word_count"] > 0

        score_resp = client.get(
            "/api/v1/score", params={"url": "http://example.com/article"}
        )
        assert score_resp.json()["ai_score"] is not None

    def test_should_return_error_for_unreachable_url(self, client: TestClient) -> None:
        with patch("app.services.detection.httpx.AsyncClient") as mock_client:
            instance = AsyncMock()
            instance.get.side_effect = Exception("Connection refused")
            instance.__aenter__.return_value = instance
            instance.__aexit__.return_value = None
            mock_client.return_value = instance

            resp = client.post(
                "/api/v1/analyze", params={"url": "http://unreachable.example.com"}
            )

        assert resp.status_code == 422
        assert "Could not fetch URL" in resp.json()["detail"]

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
        html = (
            "<html><body><p>" + ("Test content sentence. " * 20) + "</p></body></html>"
        )
        mock_response = AsyncMock()
        mock_response.text = html
        mock_response.raise_for_status = lambda: None

        with patch("app.services.detection.httpx.AsyncClient") as mock_client:
            instance = AsyncMock()
            instance.get.return_value = mock_response
            instance.__aenter__.return_value = instance
            instance.__aexit__.return_value = None
            mock_client.return_value = instance

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
