"""Registration endpoint: creation, auto-login, validation, and throttling."""

from __future__ import annotations

import pytest
from django.db import IntegrityError
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from accounts.models import User

pytestmark = pytest.mark.django_db

REGISTER_URL = "/api/v1/auth/register/"


def test_register_success_returns_user_and_token(client: APIClient, password: str) -> None:
    response = client.post(
        REGISTER_URL, {"email": "new@example.com", "password": password}, format="json"
    )

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"user", "csrf_token"}
    assert set(body["user"]) == {"id", "email"}
    assert body["user"]["email"] == "new@example.com"
    assert isinstance(body["user"]["id"], int)
    assert body["csrf_token"]
    assert User.objects.filter(email="new@example.com").exists()


def test_register_logs_in_and_sets_session_cookie(client: APIClient, password: str) -> None:
    response = client.post(
        REGISTER_URL, {"email": "new@example.com", "password": password}, format="json"
    )
    assert response.status_code == 201
    assert "sessionid" in response.cookies

    # The session is live: /me now returns the newly created user.
    me = client.get("/api/v1/auth/me/")
    assert me.status_code == 200
    assert me.json()["email"] == "new@example.com"


def test_register_hashes_password_and_never_returns_it(client: APIClient, password: str) -> None:
    response = client.post(
        REGISTER_URL, {"email": "secure@example.com", "password": password}, format="json"
    )
    assert response.status_code == 201
    assert "password" not in response.json()
    assert "password" not in response.json()["user"]

    stored = User.objects.get(email="secure@example.com")
    assert stored.password != password
    assert stored.check_password(password)


@pytest.mark.parametrize("weak", ["short", "12345678", "password"])
def test_register_rejects_weak_password(client: APIClient, weak: str) -> None:
    response = client.post(
        REGISTER_URL, {"email": "weak@example.com", "password": weak}, format="json"
    )

    assert response.status_code == 400
    assert "password" in response.json()
    assert not User.objects.filter(email="weak@example.com").exists()


def test_register_rejects_blank_email(client: APIClient, password: str) -> None:
    response = client.post(REGISTER_URL, {"email": "", "password": password}, format="json")

    assert response.status_code == 400
    assert "email" in response.json()


def test_register_rejects_invalid_email(client: APIClient, password: str) -> None:
    response = client.post(
        REGISTER_URL, {"email": "not-an-email", "password": password}, format="json"
    )

    assert response.status_code == 400
    assert "email" in response.json()


def test_register_canonicalizes_email(client: APIClient, password: str) -> None:
    response = client.post(
        REGISTER_URL, {"email": "  MixedCase@Example.COM  ", "password": password}, format="json"
    )

    assert response.status_code == 201
    assert response.json()["user"]["email"] == "mixedcase@example.com"
    assert User.objects.filter(email="mixedcase@example.com").exists()


def test_register_rejects_case_insensitive_duplicate(client: APIClient, password: str) -> None:
    User.objects.create_user(email="dupe@example.com", password=password)

    response = client.post(
        REGISTER_URL, {"email": "DUPE@Example.com", "password": password}, format="json"
    )

    assert response.status_code == 400
    assert "email" in response.json()
    assert User.objects.filter(email="dupe@example.com").count() == 1


def test_register_integrity_race_becomes_400(
    client: APIClient, password: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Simulate the race where the serializer's uniqueness check passes but the
    # INSERT loses to a concurrent creation: the view must convert the
    # IntegrityError into the same safe, field-level 400.
    def _raise(*args: object, **kwargs: object) -> User:
        raise IntegrityError("duplicate key value violates unique constraint")

    monkeypatch.setattr(User.objects, "create_user", _raise)

    response = client.post(
        REGISTER_URL, {"email": "race@example.com", "password": password}, format="json"
    )

    assert response.status_code == 400
    assert "email" in response.json()


def test_register_is_throttled_at_its_scope(password: str, monkeypatch: pytest.MonkeyPatch) -> None:
    # Tighten only the register scope for speed. Rates are bound to the throttle
    # class at import, so override the class attribute rather than the setting.
    monkeypatch.setattr(
        ScopedRateThrottle,
        "THROTTLE_RATES",
        {"auth_register": "1/hour", "auth_login": "10/minute"},
    )

    # Fresh anonymous clients: a successful register logs the client in, and an
    # authenticated request would throttle per-user rather than per-IP.
    first = APIClient().post(
        REGISTER_URL, {"email": "one@example.com", "password": password}, format="json"
    )
    assert first.status_code == 201

    second = APIClient().post(
        REGISTER_URL, {"email": "two@example.com", "password": password}, format="json"
    )
    assert second.status_code == 429
