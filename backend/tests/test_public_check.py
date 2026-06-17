from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.sources import ExtractedContent

AI_CONTENT = ExtractedContent(
    platform="generic",
    content_type="text",
    title="Generated",
    text="This sentence repeats. This sentence repeats. " * 12,
    author=None,
    media_urls=[],
)


class TestCheck:
    def test_should_return_unknown_for_new_url(self, client: TestClient) -> None:
        resp = client.get("/api/v1/check", params={"url": "http://example.com/fresh"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["verdict"] == "unknown"
        assert data["analyzed"] is False
        assert data["ai_probability"] is None
        assert data["votes"]["total"] == 0

    def test_should_reflect_crowd_votes(self, client: TestClient) -> None:
        url = "http://example.com/voted"
        client.post("/api/v1/vote", json={"url": url, "vote": "ai_generated"})

        resp = client.get("/api/v1/check", params={"url": url})
        data = resp.json()
        assert data["verdict"] == "ai_generated"
        assert data["votes"]["ai_generated"] == 1
        assert data["signals"]["crowd_score"] == 1.0

    def test_should_analyze_inline_when_requested(self, client: TestClient) -> None:
        with patch(
            "app.api.analysis.extract_content",
            new=AsyncMock(return_value=AI_CONTENT),
        ):
            resp = client.get(
                "/api/v1/check",
                params={"url": "http://example.com/analyze-me", "analyze": "true"},
            )
        data = resp.json()
        assert data["analyzed"] is True
        assert data["ai_probability"] is not None
        assert data["platform"] == "generic"

    def test_should_reject_invalid_url(self, client: TestClient) -> None:
        resp = client.get("/api/v1/check", params={"url": "ftp://example.com"})
        assert resp.status_code == 422

    def test_should_detect_platform_without_analysis(self, client: TestClient) -> None:
        url = "https://www.reddit.com/r/x/comments/a/t/"
        client.post("/api/v1/vote", json={"url": url, "vote": "human"})
        resp = client.get("/api/v1/check", params={"url": url})
        assert resp.json()["platform"] == "reddit"

    def test_should_reject_invalid_api_key(self, client: TestClient) -> None:
        resp = client.get(
            "/api/v1/check",
            params={"url": "http://example.com/x"},
            headers={"X-API-Key": "afor_not_a_real_key"},
        )
        assert resp.status_code == 401
