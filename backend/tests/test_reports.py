from __future__ import annotations

from fastapi.testclient import TestClient


class TestSubmitReport:
    def test_should_create_report(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/report",
            json={
                "url": "http://example.com/misclassified",
                "reported_verdict": "human",
                "reason": "This is clearly a real photo, not AI.",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["reported_verdict"] == "human"
        assert data["status"] == "open"
        assert data["reason"] == "This is clearly a real photo, not AI."

    def test_should_reject_invalid_verdict(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/report",
            json={"url": "http://example.com/x", "reported_verdict": "maybe"},
        )
        assert resp.status_code == 422

    def test_should_reject_invalid_url(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/report",
            json={"url": "ftp://bad", "reported_verdict": "human"},
        )
        assert resp.status_code == 422


class TestListReports:
    def test_should_list_reports(self, client: TestClient) -> None:
        client.post(
            "/api/v1/report",
            json={"url": "http://example.com/a", "reported_verdict": "human"},
        )
        client.post(
            "/api/v1/report",
            json={"url": "http://example.com/b", "reported_verdict": "ai_generated"},
        )

        resp = client.get("/api/v1/reports")
        assert resp.status_code == 200
        reports = resp.json()
        assert len(reports) == 2

    def test_should_filter_by_status(self, client: TestClient) -> None:
        client.post(
            "/api/v1/report",
            json={"url": "http://example.com/c", "reported_verdict": "human"},
        )

        resp = client.get("/api/v1/reports", params={"status": "resolved"})
        assert resp.status_code == 200
        assert len(resp.json()) == 0

        resp = client.get("/api/v1/reports", params={"status": "open"})
        assert len(resp.json()) == 1
