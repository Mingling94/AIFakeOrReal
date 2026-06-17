from __future__ import annotations

from fastapi.testclient import TestClient


class TestApiKeys:
    def test_should_create_key(self, client: TestClient) -> None:
        resp = client.post("/api/v1/keys", json={"name": "my app"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["api_key"].startswith("afor_")
        assert data["tier"] == "free"
        assert data["name"] == "my app"
        assert data["prefix"]

    def test_usage_should_require_key(self, client: TestClient) -> None:
        resp = client.get("/api/v1/keys/usage")
        assert resp.status_code == 401

    def test_usage_should_reject_invalid_key(self, client: TestClient) -> None:
        resp = client.get("/api/v1/keys/usage", headers={"X-API-Key": "afor_bogus"})
        assert resp.status_code == 401

    def test_usage_should_report_counts(self, client: TestClient) -> None:
        key = client.post("/api/v1/keys", json={"name": "metered"}).json()["api_key"]
        headers = {"X-API-Key": key}

        # Each /check with the key should increment usage.
        client.get(
            "/api/v1/check", params={"url": "http://example.com/a"}, headers=headers
        )
        client.get(
            "/api/v1/check", params={"url": "http://example.com/b"}, headers=headers
        )

        usage = client.get("/api/v1/keys/usage", headers=headers).json()
        # 2 checks + the usage call itself is not counted (different endpoint).
        assert usage["request_count"] == 2
        assert usage["tier"] == "free"
