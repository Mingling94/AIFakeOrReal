from __future__ import annotations

from fastapi.testclient import TestClient


class TestRoot:
    def test_should_return_status_ok(self, client: TestClient) -> None:
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["name"] == "AI Fake Or Real API"
        assert data["version"] == "0.1.0"
