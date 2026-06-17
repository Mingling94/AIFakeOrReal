from __future__ import annotations

from fastapi.testclient import TestClient


class TestGetScore:
    def test_should_create_entry_for_new_url(self, client: TestClient) -> None:
        resp = client.get("/api/v1/score", params={"url": "http://example.com/new"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["url"] == "http://example.com/new"
        assert data["domain"] == "example.com"
        assert data["combined_score"] is None
        assert data["vote_count"] == 0
        assert data["confidence"] == "none"

    def test_should_return_same_entry_for_same_url(self, client: TestClient) -> None:
        resp1 = client.get("/api/v1/score", params={"url": "http://example.com/same"})
        resp2 = client.get("/api/v1/score", params={"url": "http://example.com/same"})
        assert resp1.json()["url_hash"] == resp2.json()["url_hash"]

    def test_should_normalize_url(self, client: TestClient) -> None:
        resp1 = client.get("/api/v1/score", params={"url": "HTTP://Example.COM/page/"})
        resp2 = client.get("/api/v1/score", params={"url": "http://example.com/page"})
        assert resp1.json()["url_hash"] == resp2.json()["url_hash"]

    def test_should_require_url_param(self, client: TestClient) -> None:
        resp = client.get("/api/v1/score")
        assert resp.status_code == 422


class TestBatchScores:
    def test_should_return_scores_for_multiple_urls(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/scores/batch",
            json={"urls": ["http://a.com", "http://b.com", "http://c.com"]},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["scores"]) == 3

    def test_should_cap_at_50_urls(self, client: TestClient) -> None:
        urls = [f"http://example{i}.com" for i in range(60)]
        resp = client.post("/api/v1/scores/batch", json={"urls": urls})
        assert resp.status_code == 200
        assert len(resp.json()["scores"]) == 50

    def test_should_handle_empty_list(self, client: TestClient) -> None:
        resp = client.post("/api/v1/scores/batch", json={"urls": []})
        assert resp.status_code == 200
        assert len(resp.json()["scores"]) == 0
