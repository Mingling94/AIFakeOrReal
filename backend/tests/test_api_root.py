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

    def test_should_attach_request_id_header(self, client: TestClient) -> None:
        resp = client.get("/")
        assert resp.headers.get("X-Request-ID")


class TestHealth:
    def test_should_report_healthy_when_db_reachable(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["database"] is True
