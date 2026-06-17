from __future__ import annotations

from fastapi.testclient import TestClient


class TestRegister:
    def test_should_return_token(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/auth/register",
            json={"email": "new@example.com", "password": "password123"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_should_reject_duplicate_email(self, client: TestClient) -> None:
        client.post(
            "/api/v1/auth/register",
            json={"email": "dup@example.com", "password": "password123"},
        )
        resp = client.post(
            "/api/v1/auth/register",
            json={"email": "dup@example.com", "password": "password456"},
        )
        assert resp.status_code == 400
        assert "already registered" in resp.json()["detail"]

    def test_should_reject_invalid_email(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/auth/register",
            json={"email": "not-an-email", "password": "password123"},
        )
        assert resp.status_code == 422

    def test_should_reject_short_password(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/auth/register",
            json={"email": "short@example.com", "password": "abc"},
        )
        assert resp.status_code == 422

    def test_should_handle_very_long_password(self, client: TestClient) -> None:
        # Over bcrypt's 72-byte limit (but within the schema cap); must not 500,
        # and login must still succeed via consistent truncation.
        long_password = "A" * 100
        reg = client.post(
            "/api/v1/auth/register",
            json={"email": "long@example.com", "password": long_password},
        )
        assert reg.status_code == 200
        login = client.post(
            "/api/v1/auth/login",
            json={"email": "long@example.com", "password": long_password},
        )
        assert login.status_code == 200


class TestLogin:
    def test_should_return_token_with_valid_credentials(
        self, client: TestClient
    ) -> None:
        client.post(
            "/api/v1/auth/register",
            json={"email": "login@example.com", "password": "password123"},
        )
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "login@example.com", "password": "password123"},
        )
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_should_reject_wrong_password(self, client: TestClient) -> None:
        client.post(
            "/api/v1/auth/register",
            json={"email": "wrong@example.com", "password": "password123"},
        )
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "wrong@example.com", "password": "wrongpass"},
        )
        assert resp.status_code == 401
        assert "Invalid" in resp.json()["detail"]

    def test_should_reject_nonexistent_user(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "ghost@example.com", "password": "password123"},
        )
        assert resp.status_code == 401


class TestMe:
    def test_should_return_user_info(
        self, client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        resp = client.get("/api/v1/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "test@example.com"
        assert data["reputation"] == 0.5
        assert data["total_votes"] == 0

    def test_should_reject_no_token(self, client: TestClient) -> None:
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    def test_should_reject_invalid_token(self, client: TestClient) -> None:
        resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        assert resp.status_code == 401
