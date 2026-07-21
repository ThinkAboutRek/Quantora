"""Create endpoint: ``POST /api/v1/portfolios/``.

Covers the success payload shape, server-side ownership binding, CSRF
enforcement on the authenticated request, the friendly duplicate rejection, and
the concurrency backstop where a duplicate slips past the serializer's pre-check
and trips the database constraint inside ``perform_create``.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from portfolios.models import Portfolio

pytestmark = pytest.mark.django_db

URL = "/api/v1/portfolios/"
EXPECTED_KEYS = {"id", "name", "base_currency", "created_at", "updated_at"}


def test_create_returns_201_with_exact_fields(auth_client: APIClient, user: User) -> None:
    response = auth_client.post(URL, {"name": "Growth"}, format="json")

    assert response.status_code == 201
    body = response.json()
    assert set(body.keys()) == EXPECTED_KEYS
    assert "owner" not in body

    portfolio = Portfolio.objects.get(pk=body["id"])
    assert portfolio.owner == user


def test_create_returns_the_canonical_trimmed_name(auth_client: APIClient) -> None:
    response = auth_client.post(URL, {"name": "  Spaced Out  "}, format="json")

    assert response.status_code == 201
    assert response.json()["name"] == "Spaced Out"


def test_create_requires_csrf(
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

    # Authenticated, but a create with no CSRF token is rejected with the generic
    # JSON 403 contract.
    response = csrf_client.post(URL, {"name": "Growth"}, format="json")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF verification failed."}


def test_duplicate_name_returns_field_level_400(auth_client: APIClient) -> None:
    first = auth_client.post(URL, {"name": "Growth"}, format="json")
    assert first.status_code == 201

    duplicate = auth_client.post(URL, {"name": "growth"}, format="json")

    assert duplicate.status_code == 400
    assert "name" in duplicate.json()


def test_uniqueness_race_is_translated_to_400_not_500(
    auth_client: APIClient,
    user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Neutralise the serializer's duplicate pre-check so a colliding name reaches
    # the database constraint, exercising the ``IntegrityError`` branch of
    # ``perform_create``. The replacement still trims, mirroring the real return.
    monkeypatch.setattr(
        "portfolios.api.serializers.PortfolioSerializer.validate_name",
        lambda self, value: value.strip(),
    )
    Portfolio.objects.create(owner=user, name="Growth")

    response = auth_client.post(URL, {"name": "growth"}, format="json")

    # The constraint violation is caught and re-raised as a field-level 400, never
    # surfacing as an unhandled 500.
    assert response.status_code == 400
    assert "name" in response.json()
    assert Portfolio.objects.filter(owner=user).count() == 1


def test_client_cannot_spoof_owner(auth_client: APIClient, user: User, other_user: User) -> None:
    response = auth_client.post(URL, {"name": "Mine", "owner": other_user.pk}, format="json")

    assert response.status_code == 201
    portfolio = Portfolio.objects.get(pk=response.json()["id"])
    assert portfolio.owner == user


def test_client_cannot_set_base_currency(auth_client: APIClient) -> None:
    response = auth_client.post(URL, {"name": "Fixed", "base_currency": "EUR"}, format="json")

    assert response.status_code == 201
    assert response.json()["base_currency"] == "USD"
    portfolio = Portfolio.objects.get(pk=response.json()["id"])
    assert portfolio.base_currency == "USD"
