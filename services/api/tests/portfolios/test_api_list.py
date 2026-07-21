"""List endpoint: ``GET /api/v1/portfolios/``.

Verifies the plain-array shape, the empty case, strict owner scoping, the
newest-first ordering, and that no owner field leaks into the items.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from portfolios.models import Portfolio

pytestmark = pytest.mark.django_db

URL = "/api/v1/portfolios/"
EXPECTED_KEYS = {"id", "name", "base_currency", "created_at", "updated_at"}


def test_empty_list_returns_empty_array(auth_client: APIClient) -> None:
    response = auth_client.get(URL)

    assert response.status_code == 200
    assert response.json() == []


def test_list_returns_a_plain_json_array(auth_client: APIClient, user: User) -> None:
    Portfolio.objects.create(owner=user, name="Growth")
    Portfolio.objects.create(owner=user, name="Income")

    response = auth_client.get(URL)

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 2


def test_list_contains_only_the_requesting_users_records(
    auth_client: APIClient, user: User, other_user: User
) -> None:
    Portfolio.objects.create(owner=user, name="Mine")
    Portfolio.objects.create(owner=other_user, name="Theirs")

    response = auth_client.get(URL)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "Mine"


def test_list_uses_newest_first_ordering(auth_client: APIClient, user: User) -> None:
    Portfolio.objects.create(owner=user, name="First")
    Portfolio.objects.create(owner=user, name="Second")
    Portfolio.objects.create(owner=user, name="Third")

    response = auth_client.get(URL)

    assert response.status_code == 200
    names = [item["name"] for item in response.json()]
    assert names == ["Third", "Second", "First"]


def test_list_items_have_no_owner_field(auth_client: APIClient, user: User) -> None:
    Portfolio.objects.create(owner=user, name="Growth")

    response = auth_client.get(URL)

    assert response.status_code == 200
    (item,) = response.json()
    assert set(item.keys()) == EXPECTED_KEYS
    assert "owner" not in item
