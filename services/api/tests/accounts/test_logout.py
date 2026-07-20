"""Logout endpoint: session teardown, idempotency, and CSRF enforcement."""

from __future__ import annotations

from collections.abc import Callable

import pytest
from rest_framework.test import APIClient

from accounts.models import User

pytestmark = pytest.mark.django_db

LOGOUT_URL = "/api/v1/auth/logout/"


def test_authenticated_logout_invalidates_session_and_clears_cookie(
    client: APIClient, user: User, password: str
) -> None:
    login_response = client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": password}, format="json"
    )
    assert login_response.status_code == 200
    assert "sessionid" in login_response.cookies

    response = client.post(LOGOUT_URL, {}, format="json")

    assert response.status_code == 204
    assert response.content == b""
    # Django clears the cookie by sending an empty value.
    assert response.cookies["sessionid"].value == ""
    # The session is gone: /me is now anonymous.
    assert client.get("/api/v1/auth/me/").status_code == 401


def test_anonymous_logout_is_idempotent_204_empty(
    csrf_client: APIClient, bootstrap: Callable[[APIClient], str]
) -> None:
    token = bootstrap(csrf_client)

    response = csrf_client.post(LOGOUT_URL, {}, format="json", HTTP_X_CSRFTOKEN=token)

    assert response.status_code == 204
    assert response.content == b""


def test_logout_requires_csrf(csrf_client: APIClient) -> None:
    response = csrf_client.post(LOGOUT_URL, {}, format="json")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF verification failed."}
