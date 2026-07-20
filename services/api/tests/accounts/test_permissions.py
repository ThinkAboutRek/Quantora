"""Permission posture: current-user, anonymous 401, and the public health probe."""

from __future__ import annotations

import pytest
from django.conf import settings
from rest_framework.test import APIClient

from accounts.models import User

pytestmark = pytest.mark.django_db

ME_URL = "/api/v1/auth/me/"


def test_me_authenticated_returns_minimal_profile(
    client: APIClient, user: User, password: str
) -> None:
    client.post("/api/v1/auth/login/", {"email": user.email, "password": password}, format="json")

    response = client.get(ME_URL)

    assert response.status_code == 200
    # Exactly id and email — no auth internals leak.
    assert response.json() == {"id": user.id, "email": user.email}


def test_me_anonymous_is_401_with_www_authenticate(client: APIClient) -> None:
    response = client.get(ME_URL)

    assert response.status_code == 401
    assert response["WWW-Authenticate"] == "Session"


def test_health_remains_public(client: APIClient) -> None:
    response = client.get("/api/v1/health/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "quantora-api"}


def test_default_posture_is_authenticated_session_only() -> None:
    # /me declares no permission_classes yet denies anonymous access, which
    # holds only because the global default is IsAuthenticated with session auth.
    assert settings.REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"] == [
        "rest_framework.permissions.IsAuthenticated"
    ]
    assert settings.REST_FRAMEWORK["DEFAULT_AUTHENTICATION_CLASSES"] == [
        "core.api.authentication.SessionAuthentication"
    ]
