"""Delete endpoint: ``DELETE /api/v1/portfolios/<pk>/``.

Permanent deletion is available only from the archived state: deleting an
active portfolio is a non-field lifecycle 400 that preserves the row, deleting
an archived one returns an empty 204 and removes it. Cross-user and nonexistent
ids share the identical concealed 404 and never alter data, and the unsafe
method requires CSRF.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from portfolios.api.views import DELETE_WHILE_ACTIVE_MESSAGE
from portfolios.models import Portfolio

pytestmark = pytest.mark.django_db


def _url(pk: int) -> str:
    return f"/api/v1/portfolios/{pk}/"


def test_deleting_an_active_portfolio_is_a_non_field_lifecycle_400(
    auth_client: APIClient, portfolio: Portfolio
) -> None:
    response = auth_client.delete(_url(portfolio.pk))

    assert response.status_code == 400
    body = response.json()
    assert body == {"detail": DELETE_WHILE_ACTIVE_MESSAGE}
    assert "name" not in body
    assert Portfolio.objects.filter(pk=portfolio.pk).exists()


def test_deleting_an_archived_portfolio_returns_204_and_removes_the_row(
    auth_client: APIClient, archived_portfolio: Portfolio
) -> None:
    response = auth_client.delete(_url(archived_portfolio.pk))

    assert response.status_code == 204
    assert response.content == b""
    assert not Portfolio.objects.filter(pk=archived_portfolio.pk).exists()


def test_cross_user_delete_is_a_concealed_404_and_preserves_the_row(
    other_auth_client: APIClient, archived_portfolio: Portfolio
) -> None:
    response = other_auth_client.delete(_url(archived_portfolio.pk))

    assert response.status_code == 404
    assert Portfolio.objects.filter(pk=archived_portfolio.pk).exists()
    archived_portfolio.refresh_from_db()
    assert archived_portfolio.is_archived is True
    assert archived_portfolio.name == "Retired"


def test_nonexistent_id_gets_the_identical_404(
    auth_client: APIClient, other_auth_client: APIClient, archived_portfolio: Portfolio
) -> None:
    non_owner = other_auth_client.delete(_url(archived_portfolio.pk))
    nonexistent = auth_client.delete(_url(999999))

    assert non_owner.status_code == 404
    assert nonexistent.status_code == 404
    assert non_owner.json() == nonexistent.json()


def test_anonymous_delete_is_401(client: APIClient, archived_portfolio: Portfolio) -> None:
    response = client.delete(_url(archived_portfolio.pk))

    assert response.status_code == 401
    assert Portfolio.objects.filter(pk=archived_portfolio.pk).exists()


def test_delete_requires_csrf(
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

    response = csrf_client.delete(_url(archived_portfolio.pk))

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF verification failed."}
    assert Portfolio.objects.filter(pk=archived_portfolio.pk).exists()
