"""Shared fixtures for the session-authentication test suite.

Everything here runs offline against SQLite. ``APIClient`` is used in two
flavours: one with CSRF enforcement off (convenient when a test only needs a
session) and one with it on (required to exercise the ``csrf_protect`` views).
"""

from __future__ import annotations

from collections.abc import Callable, Iterator

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from accounts.models import User

# A password that clears every configured validator (long, non-numeric, not a
# common password, dissimilar to the test emails).
PASSWORD = "sturdy-passphrase-42"


@pytest.fixture(autouse=True)
def _clear_throttle_cache() -> Iterator[None]:
    # ScopedRateThrottle counters live in the default local-memory cache; clear
    # it around every test so throttle state never leaks between tests.
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def password() -> str:
    return PASSWORD


@pytest.fixture
def client() -> APIClient:
    """A client with CSRF enforcement disabled."""
    return APIClient()


@pytest.fixture
def csrf_client() -> APIClient:
    """A client that enforces CSRF, as a real browser would be subject to."""
    return APIClient(enforce_csrf_checks=True)


@pytest.fixture
def user() -> User:
    """A persisted, active user with the shared test password."""
    return User.objects.create_user(email="trader@example.com", password=PASSWORD)


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
