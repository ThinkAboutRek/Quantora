"""Shared fixtures for the portfolios test suite.

Everything here runs offline against SQLite. As in the accounts suite, the
``APIClient`` comes in two flavours — one with CSRF enforcement off (convenient
for exercising view logic) and one with it on (required to prove CSRF is
enforced on the authenticated create). Two persisted users let the owner-scoping
and per-owner uniqueness rules be verified directly.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from portfolios.models import Portfolio

# A password that clears every configured validator, matching the accounts suite.
PASSWORD = "sturdy-passphrase-42"


@pytest.fixture
def password() -> str:
    return PASSWORD


@pytest.fixture
def user() -> User:
    """A persisted, active user who owns the portfolios under test."""
    return User.objects.create_user(email="owner@example.com", password=PASSWORD)


@pytest.fixture
def other_user() -> User:
    """A second user, used to prove records never cross owner boundaries."""
    return User.objects.create_user(email="other@example.com", password=PASSWORD)


@pytest.fixture
def client() -> APIClient:
    """A client with CSRF enforcement disabled."""
    return APIClient()


@pytest.fixture
def csrf_client() -> APIClient:
    """A client that enforces CSRF, as a real browser would be subject to."""
    return APIClient(enforce_csrf_checks=True)


@pytest.fixture
def auth_client(client: APIClient, user: User) -> APIClient:
    """A client authenticated as ``user``.

    ``force_authenticate`` binds the session user without going through the CSRF
    machinery, so this client is for exercising view logic (list/create), not for
    the CSRF-enforcement test — that one logs in through the real endpoint.
    """
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def other_auth_client(other_user: User) -> APIClient:
    """A second client authenticated as ``other_user``.

    Used to prove that detail lookups and every mutation are owner-scoped: this
    client must receive the concealed 404 for ``user``'s portfolios, and never
    alter them.
    """
    api_client = APIClient()
    api_client.force_authenticate(user=other_user)
    return api_client


@pytest.fixture
def portfolio(user: User) -> Portfolio:
    """An active portfolio owned by ``user``."""
    return Portfolio.objects.create(owner=user, name="Growth")


@pytest.fixture
def archived_portfolio(user: User) -> Portfolio:
    """An archived portfolio owned by ``user``."""
    return Portfolio.objects.create(owner=user, name="Retired", is_archived=True)


@pytest.fixture
def bootstrap() -> Callable[[APIClient], str]:
    """Return a helper that hits the CSRF bootstrap and returns the masked token.

    The ``csrftoken`` cookie is left on the passed client, so a follow-up unsafe
    request only needs to echo the returned token in the ``X-CSRFToken`` header.
    """

    def _bootstrap(api_client: APIClient) -> str:
        response = api_client.get("/api/v1/auth/csrf/")
        assert response.status_code == 200
        token: str = response.json()["csrf_token"]
        return token

    return _bootstrap
