"""List endpoint: ``GET /api/v1/portfolios/``.

Verifies the plain-array shape, the empty case, strict owner scoping, the
newest-first ordering, that no owner field leaks into the items, and the strict
``archived`` filter: the default list is active-only, ``archived=true`` is the
archived list, and any other non-empty value is a non-field 400.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from portfolios.models import Portfolio

pytestmark = pytest.mark.django_db

URL = "/api/v1/portfolios/"
EXPECTED_KEYS = {"id", "name", "base_currency", "is_archived", "created_at", "updated_at"}


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


def test_default_list_excludes_archived(
    auth_client: APIClient, portfolio: Portfolio, archived_portfolio: Portfolio
) -> None:
    response = auth_client.get(URL)

    assert response.status_code == 200
    names = [item["name"] for item in response.json()]
    assert names == [portfolio.name]


def test_archived_true_returns_only_archived(
    auth_client: APIClient, portfolio: Portfolio, archived_portfolio: Portfolio
) -> None:
    response = auth_client.get(URL, {"archived": "true"})

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    names = [item["name"] for item in body]
    assert names == [archived_portfolio.name]
    assert all(item["is_archived"] is True for item in body)


def test_archived_false_returns_only_active(
    auth_client: APIClient, portfolio: Portfolio, archived_portfolio: Portfolio
) -> None:
    response = auth_client.get(URL, {"archived": "false"})

    assert response.status_code == 200
    names = [item["name"] for item in response.json()]
    assert names == [portfolio.name]


def test_archived_filter_is_case_insensitive(
    auth_client: APIClient, archived_portfolio: Portfolio
) -> None:
    response = auth_client.get(URL, {"archived": "TRUE"})

    assert response.status_code == 200
    assert [item["name"] for item in response.json()] == [archived_portfolio.name]


def test_empty_archived_value_means_active(
    auth_client: APIClient, portfolio: Portfolio, archived_portfolio: Portfolio
) -> None:
    response = auth_client.get(f"{URL}?archived=")

    assert response.status_code == 200
    assert [item["name"] for item in response.json()] == [portfolio.name]


def test_invalid_archived_value_is_a_non_field_400(auth_client: APIClient) -> None:
    response = auth_client.get(URL, {"archived": "maybe"})

    assert response.status_code == 400
    body = response.json()
    # Non-field detail shape from the JSON error contract — not a field error,
    # and never a silent fallback to a list the caller did not ask for.
    assert set(body.keys()) == {"detail"}
    assert isinstance(body["detail"], str)


def test_all_is_not_an_accepted_filter_value(auth_client: APIClient) -> None:
    response = auth_client.get(URL, {"archived": "all"})

    assert response.status_code == 400


def test_archived_list_is_owner_scoped(
    auth_client: APIClient, other_user: User, archived_portfolio: Portfolio
) -> None:
    Portfolio.objects.create(owner=other_user, name="Their archive", is_archived=True)

    response = auth_client.get(URL, {"archived": "true"})

    assert response.status_code == 200
    assert [item["name"] for item in response.json()] == [archived_portfolio.name]


def test_archived_list_is_a_plain_array_with_expected_keys(
    auth_client: APIClient, archived_portfolio: Portfolio
) -> None:
    response = auth_client.get(URL, {"archived": "true"})

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    (item,) = body
    assert set(item.keys()) == EXPECTED_KEYS
