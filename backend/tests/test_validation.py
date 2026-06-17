from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.services.scoring import validate_url


class TestValidateUrl:
    def test_should_accept_http(self) -> None:
        validate_url("http://example.com/page")

    def test_should_accept_https(self) -> None:
        validate_url("https://example.com/page")

    def test_should_reject_empty(self) -> None:
        with pytest.raises(ValueError, match="empty"):
            validate_url("")

    def test_should_reject_non_http_scheme(self) -> None:
        with pytest.raises(ValueError, match="http or https"):
            validate_url("ftp://example.com")

    def test_should_reject_missing_host(self) -> None:
        with pytest.raises(ValueError, match="host"):
            validate_url("http://")

    def test_should_reject_overlong_url(self) -> None:
        with pytest.raises(ValueError, match="maximum length"):
            validate_url("http://example.com/" + "a" * 3000)


class TestEndpointUrlValidation:
    def test_score_should_reject_bad_scheme(self, client: TestClient) -> None:
        resp = client.get("/api/v1/score", params={"url": "javascript:alert(1)"})
        assert resp.status_code == 422

    def test_vote_should_reject_bad_scheme(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/vote", json={"url": "ftp://example.com", "vote": "human"}
        )
        assert resp.status_code == 422

    def test_batch_should_skip_invalid_urls(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/scores/batch",
            json={"urls": ["http://good.com", "ftp://bad.com", "not-a-url"]},
        )
        assert resp.status_code == 200
        scores = resp.json()["scores"]
        assert len(scores) == 1
        assert scores[0]["domain"] == "good.com"
