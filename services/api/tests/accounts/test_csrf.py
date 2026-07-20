"""CSRF bootstrap, enforcement, rotation, and origin checks for the auth API."""

from __future__ import annotations

import re
from collections.abc import Callable

import pytest
from rest_framework.exceptions import PermissionDenied
from rest_framework.request import Request
from rest_framework.test import APIClient, APIRequestFactory

from core.api.authentication import SessionAuthentication

pytestmark = pytest.mark.django_db

VITE_ORIGIN = "http://localhost:5173"
UNSAFE_PATHS = [
    "/api/v1/auth/register/",
    "/api/v1/auth/login/",
    "/api/v1/auth/logout/",
]
# Django's masked CSRF token is 64 characters drawn from the CSRF alphabet.
MASKED_TOKEN = re.compile(r"^[A-Za-z0-9]{64}$")


def _register_body(email: str = "new@example.com") -> dict[str, str]:
    return {"email": email, "password": "sturdy-passphrase-42"}


def test_bootstrap_returns_masked_token_and_sets_cookie(csrf_client: APIClient) -> None:
    response = csrf_client.get("/api/v1/auth/csrf/")

    assert response.status_code == 200
    assert MASKED_TOKEN.match(response.json()["csrf_token"])
    assert "csrftoken" in response.cookies
    # The bootstrap must not open a session.
    assert "sessionid" not in response.cookies


@pytest.mark.parametrize("path", UNSAFE_PATHS)
def test_anonymous_unsafe_without_token_is_json_403(csrf_client: APIClient, path: str) -> None:
    response = csrf_client.post(path, _register_body(), format="json")

    assert response.status_code == 403
    assert response["Content-Type"].startswith("application/json")
    # A JSON body, never Django's HTML CSRF page, and with a generic message.
    assert response.json() == {"detail": "CSRF verification failed."}


def test_register_proceeds_with_cookie_token_and_origin(
    csrf_client: APIClient, bootstrap: Callable[[APIClient], str]
) -> None:
    token = bootstrap(csrf_client)

    response = csrf_client.post(
        "/api/v1/auth/register/",
        _register_body(),
        format="json",
        HTTP_X_CSRFTOKEN=token,
        HTTP_ORIGIN=VITE_ORIGIN,
    )

    assert response.status_code == 201


def test_login_proceeds_with_cookie_token_and_origin(
    csrf_client: APIClient,
    bootstrap: Callable[[APIClient], str],
    user: object,
    password: str,
) -> None:
    token = bootstrap(csrf_client)

    response = csrf_client.post(
        "/api/v1/auth/login/",
        {"email": "trader@example.com", "password": password},
        format="json",
        HTTP_X_CSRFTOKEN=token,
        HTTP_ORIGIN=VITE_ORIGIN,
    )

    assert response.status_code == 200


def test_logout_proceeds_with_cookie_token_and_origin(
    csrf_client: APIClient, bootstrap: Callable[[APIClient], str]
) -> None:
    token = bootstrap(csrf_client)

    response = csrf_client.post(
        "/api/v1/auth/logout/",
        {},
        format="json",
        HTTP_X_CSRFTOKEN=token,
        HTTP_ORIGIN=VITE_ORIGIN,
    )

    assert response.status_code == 204


def test_authenticated_logout_still_requires_csrf(
    csrf_client: APIClient,
    bootstrap: Callable[[APIClient], str],
    user: object,
    password: str,
) -> None:
    token = bootstrap(csrf_client)
    logged_in = csrf_client.post(
        "/api/v1/auth/login/",
        {"email": "trader@example.com", "password": password},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert logged_in.status_code == 200

    # Authenticated, but a logout with no token is still rejected.
    response = csrf_client.post("/api/v1/auth/logout/", {}, format="json")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF verification failed."}


def test_pre_login_token_is_rejected_after_login(
    csrf_client: APIClient,
    bootstrap: Callable[[APIClient], str],
    user: object,
    password: str,
) -> None:
    pre_login_token = bootstrap(csrf_client)

    login_response = csrf_client.post(
        "/api/v1/auth/login/",
        {"email": "trader@example.com", "password": password},
        format="json",
        HTTP_X_CSRFTOKEN=pre_login_token,
    )
    assert login_response.status_code == 200
    post_login_token = login_response.json()["csrf_token"]

    # The pre-login token no longer matches the rotated post-login secret.
    stale = csrf_client.post(
        "/api/v1/auth/logout/", {}, format="json", HTTP_X_CSRFTOKEN=pre_login_token
    )
    assert stale.status_code == 403

    # The token returned by login works for the subsequent logout.
    ok = csrf_client.post(
        "/api/v1/auth/logout/", {}, format="json", HTTP_X_CSRFTOKEN=post_login_token
    )
    assert ok.status_code == 204


def test_post_logout_token_rejected_then_fresh_bootstrap_usable(
    csrf_client: APIClient,
    bootstrap: Callable[[APIClient], str],
    user: object,
    password: str,
) -> None:
    token = bootstrap(csrf_client)
    login_response = csrf_client.post(
        "/api/v1/auth/login/",
        {"email": "trader@example.com", "password": password},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert login_response.status_code == 200
    post_login_token = login_response.json()["csrf_token"]

    logout_response = csrf_client.post(
        "/api/v1/auth/logout/", {}, format="json", HTTP_X_CSRFTOKEN=post_login_token
    )
    assert logout_response.status_code == 204

    # Logout rotated the secret again, so the token it accepted is now stale.
    stale = csrf_client.post(
        "/api/v1/auth/register/",
        _register_body("after-logout@example.com"),
        format="json",
        HTTP_X_CSRFTOKEN=post_login_token,
    )
    assert stale.status_code == 403

    # A fresh bootstrap yields a usable token again.
    fresh_token = bootstrap(csrf_client)
    fresh = csrf_client.post(
        "/api/v1/auth/register/",
        _register_body("after-logout@example.com"),
        format="json",
        HTTP_X_CSRFTOKEN=fresh_token,
    )
    assert fresh.status_code == 201


def test_origin_mismatch_rejected_and_trusted_origin_accepted(
    csrf_client: APIClient, bootstrap: Callable[[APIClient], str]
) -> None:
    token = bootstrap(csrf_client)

    mismatched = csrf_client.post(
        "/api/v1/auth/register/",
        _register_body(),
        format="json",
        HTTP_X_CSRFTOKEN=token,
        HTTP_ORIGIN="http://evil.example",
    )
    assert mismatched.status_code == 403
    assert mismatched.json() == {"detail": "CSRF verification failed."}

    trusted_token = bootstrap(csrf_client)
    trusted = csrf_client.post(
        "/api/v1/auth/register/",
        _register_body(),
        format="json",
        HTTP_X_CSRFTOKEN=trusted_token,
        HTTP_ORIGIN=VITE_ORIGIN,
    )
    assert trusted.status_code == 201


def test_enforce_csrf_raises_generic_message_not_django_reason() -> None:
    # A direct unit test: the parent would raise "CSRF Failed: CSRF cookie not
    # set."; our override must collapse that to the generic message.
    factory = APIRequestFactory(enforce_csrf_checks=True)
    request = Request(factory.post("/api/v1/auth/login/"))

    with pytest.raises(PermissionDenied) as exc_info:
        SessionAuthentication().enforce_csrf(request)

    detail = str(exc_info.value.detail)
    assert detail == "CSRF verification failed."
    assert "cookie" not in detail.lower()
    assert "referer" not in detail.lower()
