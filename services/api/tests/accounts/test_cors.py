"""CORS behaviour, cookie flags, and per-environment Secure-cookie posture."""

from __future__ import annotations

import importlib

import pytest
from rest_framework.test import APIClient

from accounts.models import User

pytestmark = pytest.mark.django_db

VITE_ORIGIN = "http://localhost:5173"
HEALTH_URL = "/api/v1/health/"
ACAO = "Access-Control-Allow-Origin"
ACAC = "Access-Control-Allow-Credentials"


def test_allowed_origin_is_reflected_with_credentials(client: APIClient) -> None:
    response = client.get(HEALTH_URL, HTTP_ORIGIN=VITE_ORIGIN)

    assert response[ACAO] == VITE_ORIGIN
    assert response[ACAC] == "true"


def test_disallowed_origin_is_not_reflected(client: APIClient) -> None:
    response = client.get(HEALTH_URL, HTTP_ORIGIN="http://evil.example")

    assert ACAO not in response


def test_credentialed_cors_never_uses_wildcard(client: APIClient) -> None:
    response = client.get(HEALTH_URL, HTTP_ORIGIN=VITE_ORIGIN)

    assert response[ACAO] != "*"


def test_cors_is_limited_to_api_paths(client: APIClient) -> None:
    # A path outside /api/ must never receive CORS headers, even for a known
    # origin (CORS_URLS_REGEX gates this).
    response = client.get("/", HTTP_ORIGIN=VITE_ORIGIN)

    assert ACAO not in response


def test_session_cookie_is_httponly(client: APIClient, user: User, password: str) -> None:
    response = client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": password}, format="json"
    )

    assert response.cookies["sessionid"]["httponly"]


def test_csrf_cookie_is_not_httponly(client: APIClient) -> None:
    response = client.get("/api/v1/auth/csrf/")

    # The SPA must read this cookie from JavaScript, so it is deliberately not
    # HttpOnly.
    assert not response.cookies["csrftoken"]["httponly"]


def test_development_secure_cookie_flags_are_off() -> None:
    development = importlib.import_module("core.settings.development")

    assert development.SESSION_COOKIE_SECURE is False
    assert development.CSRF_COOKIE_SECURE is False


def test_production_secure_cookie_foundations_are_on(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Production reads its secret/hosts and the database connection from the
    # environment at import; supply throwaway values, then confirm the Secure
    # foundations are set.
    monkeypatch.setenv("DJANGO_SECRET_KEY", "x" * 50)
    monkeypatch.setenv("DJANGO_ALLOWED_HOSTS", "api.quantora.test")
    monkeypatch.setenv("POSTGRES_DB", "throwaway")
    monkeypatch.setenv("POSTGRES_USER", "throwaway")
    monkeypatch.setenv("POSTGRES_PASSWORD", "throwaway")
    monkeypatch.setenv("POSTGRES_HOST", "localhost")
    monkeypatch.setenv("POSTGRES_PORT", "5432")

    production = importlib.reload(importlib.import_module("core.settings.production"))

    assert production.SESSION_COOKIE_SECURE is True
    assert production.CSRF_COOKIE_SECURE is True
    assert production.SECURE_SSL_REDIRECT is True
