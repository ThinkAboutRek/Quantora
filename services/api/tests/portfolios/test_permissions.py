"""Permission posture for the portfolio endpoint, plus unchanged-surface smoke.

Anonymous access is rejected with 401 (session auth advertises a scheme), an
authenticated write without a CSRF token gets the generic JSON 403, and the
health probe and Phase 6 auth endpoints continue to behave as before.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest
from rest_framework.test import APIClient

from accounts.models import User

pytestmark = pytest.mark.django_db

URL = "/api/v1/portfolios/"


def test_anonymous_get_is_401(client: APIClient) -> None:
    response = client.get(URL)

    assert response.status_code == 401
    assert response["WWW-Authenticate"] == "Session"


def test_anonymous_post_is_401(client: APIClient) -> None:
    response = client.post(URL, {"name": "Growth"}, format="json")

    assert response.status_code == 401


def test_authenticated_post_without_csrf_is_json_403(
    csrf_client: APIClient,
    bootstrap: Callable[[APIClient], str],
    user: User,
    password: str,
) -> None:
    token = bootstrap(csrf_client)
    logged_in = csrf_client.post(
        "/api/v1/auth/login/",
        {"email": user.email, "password": password},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert logged_in.status_code == 200

    response = csrf_client.post(URL, {"name": "Growth"}, format="json")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF verification failed."}


def test_health_endpoint_unchanged(client: APIClient) -> None:
    response = client.get("/api/v1/health/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "quantora-api"}


def test_auth_me_endpoint_unchanged(client: APIClient, user: User, password: str) -> None:
    # Anonymous /me is still 401 ...
    anonymous = client.get("/api/v1/auth/me/")
    assert anonymous.status_code == 401

    # ... and a normal login still yields the minimal authenticated profile.
    client.post(
        "/api/v1/auth/login/",
        {"email": user.email, "password": password},
        format="json",
    )
    authenticated = client.get("/api/v1/auth/me/")
    assert authenticated.status_code == 200
    assert authenticated.json() == {"id": user.id, "email": user.email}
