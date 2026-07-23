"""Lifecycle actions: ``POST /api/v1/portfolios/<pk>/archive/`` and ``…/unarchive/``.

Both actions are idempotent POSTs returning the authoritative record: a real
transition saves (bumping ``updated_at``), a no-op transition saves nothing and
leaves ``updated_at`` untouched. Archived portfolios leave the default list and
appear under ``archived=true``; unarchive reverses that. Cross-user attempts get
the concealed 404 and never alter the row, and both actions require CSRF.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from portfolios.models import Portfolio

pytestmark = pytest.mark.django_db

LIST_URL = "/api/v1/portfolios/"


def _archive_url(pk: int) -> str:
    return f"/api/v1/portfolios/{pk}/archive/"


def _unarchive_url(pk: int) -> str:
    return f"/api/v1/portfolios/{pk}/unarchive/"


# --- Archive -----------------------------------------------------------------


def test_archive_transitions_active_to_archived(
    auth_client: APIClient, portfolio: Portfolio
) -> None:
    response = auth_client.post(_archive_url(portfolio.pk))

    assert response.status_code == 200
    assert response.json()["is_archived"] is True
    portfolio.refresh_from_db()
    assert portfolio.is_archived is True


def test_archive_bumps_updated_at_on_a_real_transition(
    auth_client: APIClient, portfolio: Portfolio
) -> None:
    before = portfolio.updated_at

    response = auth_client.post(_archive_url(portfolio.pk))

    assert response.status_code == 200
    portfolio.refresh_from_db()
    assert portfolio.updated_at > before


def test_archive_is_idempotent_without_bumping_updated_at(
    auth_client: APIClient, archived_portfolio: Portfolio
) -> None:
    before = archived_portfolio.updated_at

    response = auth_client.post(_archive_url(archived_portfolio.pk))

    assert response.status_code == 200
    assert response.json()["is_archived"] is True
    archived_portfolio.refresh_from_db()
    assert archived_portfolio.is_archived is True
    # No-op transition: nothing was saved, so ``updated_at`` did not move.
    assert archived_portfolio.updated_at == before


def test_archived_portfolio_moves_between_the_lists(
    auth_client: APIClient, portfolio: Portfolio
) -> None:
    archived = auth_client.post(_archive_url(portfolio.pk))
    assert archived.status_code == 200

    default_list = auth_client.get(LIST_URL)
    archived_list = auth_client.get(LIST_URL, {"archived": "true"})

    assert default_list.status_code == 200
    assert default_list.json() == []
    assert [item["id"] for item in archived_list.json()] == [portfolio.pk]


def test_cross_user_archive_is_a_concealed_404_and_leaves_the_row(
    other_auth_client: APIClient, portfolio: Portfolio
) -> None:
    response = other_auth_client.post(_archive_url(portfolio.pk))

    assert response.status_code == 404
    portfolio.refresh_from_db()
    assert portfolio.is_archived is False


def test_anonymous_archive_is_401(client: APIClient, portfolio: Portfolio) -> None:
    response = client.post(_archive_url(portfolio.pk))

    assert response.status_code == 401
    portfolio.refresh_from_db()
    assert portfolio.is_archived is False


def test_archive_requires_csrf(
    csrf_client: APIClient,
    bootstrap: Callable[[APIClient], str],
    user: User,
    password: str,
    portfolio: Portfolio,
) -> None:
    token = bootstrap(csrf_client)
    logged_in = csrf_client.post(
        "/api/v1/auth/login/",
        {"email": user.email, "password": password},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert logged_in.status_code == 200

    response = csrf_client.post(_archive_url(portfolio.pk))

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF verification failed."}
    portfolio.refresh_from_db()
    assert portfolio.is_archived is False


# --- Unarchive ---------------------------------------------------------------


def test_unarchive_transitions_archived_to_active(
    auth_client: APIClient, archived_portfolio: Portfolio
) -> None:
    response = auth_client.post(_unarchive_url(archived_portfolio.pk))

    assert response.status_code == 200
    assert response.json()["is_archived"] is False
    archived_portfolio.refresh_from_db()
    assert archived_portfolio.is_archived is False


def test_unarchive_is_idempotent_without_bumping_updated_at(
    auth_client: APIClient, portfolio: Portfolio
) -> None:
    before = portfolio.updated_at

    response = auth_client.post(_unarchive_url(portfolio.pk))

    assert response.status_code == 200
    assert response.json()["is_archived"] is False
    portfolio.refresh_from_db()
    assert portfolio.is_archived is False
    assert portfolio.updated_at == before


def test_unarchived_portfolio_returns_to_the_active_list(
    auth_client: APIClient, archived_portfolio: Portfolio
) -> None:
    restored = auth_client.post(_unarchive_url(archived_portfolio.pk))
    assert restored.status_code == 200

    default_list = auth_client.get(LIST_URL)
    archived_list = auth_client.get(LIST_URL, {"archived": "true"})

    assert [item["id"] for item in default_list.json()] == [archived_portfolio.pk]
    assert archived_list.json() == []


def test_cross_user_unarchive_is_a_concealed_404_and_leaves_the_row(
    other_auth_client: APIClient, archived_portfolio: Portfolio
) -> None:
    response = other_auth_client.post(_unarchive_url(archived_portfolio.pk))

    assert response.status_code == 404
    archived_portfolio.refresh_from_db()
    assert archived_portfolio.is_archived is True


def test_unarchive_requires_csrf(
    csrf_client: APIClient,
    bootstrap: Callable[[APIClient], str],
    user: User,
    password: str,
    archived_portfolio: Portfolio,
) -> None:
    token = bootstrap(csrf_client)
    logged_in = csrf_client.post(
        "/api/v1/auth/login/",
        {"email": user.email, "password": password},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert logged_in.status_code == 200

    response = csrf_client.post(_unarchive_url(archived_portfolio.pk))

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF verification failed."}
    archived_portfolio.refresh_from_db()
    assert archived_portfolio.is_archived is True
