"""Detail endpoint: ``GET /api/v1/portfolios/<pk>/``.

The owner can retrieve a portfolio in either state; everyone else — a different
authenticated user or a nonexistent id — receives the identical concealed 404,
because the lookup runs against the owner-scoped queryset before anything else.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from portfolios.models import Portfolio

pytestmark = pytest.mark.django_db

EXPECTED_KEYS = {"id", "name", "base_currency", "is_archived", "created_at", "updated_at"}


def _url(pk: int) -> str:
    return f"/api/v1/portfolios/{pk}/"


def test_owner_retrieves_active_portfolio(auth_client: APIClient, portfolio: Portfolio) -> None:
    response = auth_client.get(_url(portfolio.pk))

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == EXPECTED_KEYS
    assert body["id"] == portfolio.pk
    assert body["name"] == portfolio.name
    assert body["is_archived"] is False
    assert "owner" not in body


def test_owner_retrieves_archived_portfolio(
    auth_client: APIClient, archived_portfolio: Portfolio
) -> None:
    response = auth_client.get(_url(archived_portfolio.pk))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == archived_portfolio.pk
    assert body["is_archived"] is True


def test_non_owner_gets_concealed_404(other_auth_client: APIClient, portfolio: Portfolio) -> None:
    response = other_auth_client.get(_url(portfolio.pk))

    assert response.status_code == 404


def test_nonexistent_id_gets_the_identical_404(
    auth_client: APIClient, other_auth_client: APIClient, portfolio: Portfolio
) -> None:
    # A non-owned id and a nonexistent id must be indistinguishable: same status,
    # same shape, same message.
    non_owner = other_auth_client.get(_url(portfolio.pk))
    nonexistent = auth_client.get(_url(999999))

    assert non_owner.status_code == 404
    assert nonexistent.status_code == 404
    assert non_owner.json() == nonexistent.json()
    assert set(non_owner.json().keys()) == {"detail"}


def test_anonymous_get_is_401(client: APIClient, portfolio: Portfolio) -> None:
    response = client.get(_url(portfolio.pk))

    assert response.status_code == 401
    assert response["WWW-Authenticate"] == "Session"


def test_put_is_not_offered(auth_client: APIClient, portfolio: Portfolio) -> None:
    response = auth_client.put(_url(portfolio.pk), {"name": "Replaced"}, format="json")

    assert response.status_code == 405
