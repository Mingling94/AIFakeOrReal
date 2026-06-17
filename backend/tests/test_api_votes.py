from __future__ import annotations

from fastapi.testclient import TestClient


class TestSubmitVote:
    def test_should_create_vote_anonymously(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/vote",
            json={"url": "http://example.com/vote1", "vote": "human"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["vote"] == "human"
        assert "url_hash" in data
        assert "id" in data

    def test_should_create_vote_authenticated(
        self, client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        resp = client.post(
            "/api/v1/vote",
            json={"url": "http://example.com/vote2", "vote": "ai_generated"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["vote"] == "ai_generated"

    def test_should_accept_mixed_vote(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/vote",
            json={"url": "http://example.com/vote3", "vote": "mixed"},
        )
        assert resp.status_code == 200
        assert resp.json()["vote"] == "mixed"

    def test_should_reject_invalid_vote_type(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/vote",
            json={"url": "http://example.com/vote4", "vote": "maybe"},
        )
        assert resp.status_code == 422

    def test_should_accept_confidence(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/vote",
            json={
                "url": "http://example.com/vote5",
                "vote": "human",
                "confidence": 0.8,
            },
        )
        assert resp.status_code == 200

    def test_should_reject_confidence_over_one(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/vote",
            json={
                "url": "http://example.com/vote6",
                "vote": "human",
                "confidence": 1.5,
            },
        )
        assert resp.status_code == 422

    def test_should_update_crowd_score_after_vote(self, client: TestClient) -> None:
        url = "http://example.com/crowd-update"
        client.post("/api/v1/vote", json={"url": url, "vote": "ai_generated"})

        resp = client.get("/api/v1/score", params={"url": url})
        data = resp.json()
        assert data["crowd_score"] is not None
        assert data["crowd_score"] > 0.5
        assert data["vote_count"] == 1

    def test_should_create_url_entry_if_missing(self, client: TestClient) -> None:
        url = "http://brand-new-url.com/page"
        resp = client.post("/api/v1/vote", json={"url": url, "vote": "human"})
        assert resp.status_code == 200

        score_resp = client.get("/api/v1/score", params={"url": url})
        assert score_resp.json()["vote_count"] == 1

    def test_should_increment_user_total_votes(
        self, client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        client.post(
            "/api/v1/vote",
            json={"url": "http://example.com/incr1", "vote": "human"},
            headers=auth_headers,
        )
        client.post(
            "/api/v1/vote",
            json={"url": "http://example.com/incr2", "vote": "mixed"},
            headers=auth_headers,
        )

        me_resp = client.get("/api/v1/auth/me", headers=auth_headers)
        assert me_resp.json()["total_votes"] == 2


class TestGetVotes:
    def test_should_return_zeroes_for_unknown_url(self, client: TestClient) -> None:
        resp = client.get("/api/v1/votes", params={"url": "http://unknown.example.com"})
        assert resp.status_code == 200
        data = resp.json()
        assert data == {"human": 0, "mixed": 0, "ai_generated": 0, "total": 0}

    def test_should_count_votes_correctly(self, client: TestClient) -> None:
        url = "http://example.com/breakdown"
        client.post("/api/v1/vote", json={"url": url, "vote": "human"})
        client.post("/api/v1/vote", json={"url": url, "vote": "human"})
        client.post("/api/v1/vote", json={"url": url, "vote": "ai_generated"})

        resp = client.get("/api/v1/votes", params={"url": url})
        data = resp.json()
        assert data["human"] == 2
        assert data["ai_generated"] == 1
        assert data["mixed"] == 0
        assert data["total"] == 3

    def test_should_require_url_param(self, client: TestClient) -> None:
        resp = client.get("/api/v1/votes")
        assert resp.status_code == 422
