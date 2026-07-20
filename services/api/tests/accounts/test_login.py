"""Login endpoint: session establishment, generic failures, and throttling."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from accounts.models import User

pytestmark = pytest.mark.django_db

LOGIN_URL = "/api/v1/auth/login/"
GENERIC_FAILURE = {"detail": "Invalid email or password."}


def test_login_success_returns_user_and_token(client: APIClient, user: User, password: str) -> None:
    response = client.post(LOGIN_URL, {"email": user.email, "password": password}, format="json")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"user", "csrf_token"}
    assert body["user"] == {"id": user.id, "email": user.email}
    assert body["csrf_token"]


def test_login_establishes_session(client: APIClient, user: User, password: str) -> None:
    response = client.post(LOGIN_URL, {"email": user.email, "password": password}, format="json")
    assert response.status_code == 200
    assert "sessionid" in response.cookies

    me = client.get("/api/v1/auth/me/")
    assert me.status_code == 200
    assert me.json()["id"] == user.id


def test_login_rotates_session_key(client: APIClient, user: User, password: str) -> None:
    # Establish an anonymous session first (this also sets its cookie on the
    # client), then confirm login rotates the key — session-fixation defence.
    pre_login_key = client.session.session_key
    assert pre_login_key is not None

    response = client.post(LOGIN_URL, {"email": user.email, "password": password}, format="json")
    assert response.status_code == 200

    post_login_key = client.session.session_key
    assert post_login_key is not None
    assert post_login_key != pre_login_key


def test_login_unknown_email_is_generic(client: APIClient) -> None:
    response = client.post(
        LOGIN_URL, {"email": "nobody@example.com", "password": "whatever-123456"}, format="json"
    )

    assert response.status_code == 400
    assert response.json() == GENERIC_FAILURE


def test_login_wrong_password_is_generic(client: APIClient, user: User, password: str) -> None:
    response = client.post(
        LOGIN_URL, {"email": user.email, "password": "the-wrong-password"}, format="json"
    )

    assert response.status_code == 400
    assert response.json() == GENERIC_FAILURE


def test_login_inactive_user_is_generic(client: APIClient, password: str) -> None:
    inactive = User.objects.create_user(email="inactive@example.com", password=password)
    inactive.is_active = False
    inactive.save(update_fields=["is_active"])

    response = client.post(
        LOGIN_URL, {"email": inactive.email, "password": password}, format="json"
    )

    assert response.status_code == 400
    assert response.json() == GENERIC_FAILURE


def test_login_is_case_insensitive_on_email(client: APIClient, user: User, password: str) -> None:
    response = client.post(
        LOGIN_URL, {"email": "TRADER@EXAMPLE.COM", "password": password}, format="json"
    )

    assert response.status_code == 200
    assert response.json()["user"]["email"] == user.email


def test_login_returns_fresh_csrf_token(client: APIClient, user: User, password: str) -> None:
    response = client.post(LOGIN_URL, {"email": user.email, "password": password}, format="json")

    assert response.status_code == 200
    token = response.json()["csrf_token"]
    assert isinstance(token, str) and len(token) == 64


def test_login_is_throttled_at_its_scope(
    client: APIClient, user: User, password: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Rates are bound to the throttle class at import, so override the class
    # attribute rather than the setting. A failed attempt still counts.
    monkeypatch.setattr(
        ScopedRateThrottle,
        "THROTTLE_RATES",
        {"auth_register": "5/hour", "auth_login": "1/minute"},
    )

    first = client.post(LOGIN_URL, {"email": user.email, "password": "wrong"}, format="json")
    assert first.status_code == 400

    second = client.post(LOGIN_URL, {"email": user.email, "password": "wrong"}, format="json")
    assert second.status_code == 429
