"""Rename endpoint: ``PATCH /api/v1/portfolios/<pk>/``.

Renames are allowed only while active. A duplicate name is a field-level
``{"name": [...]}`` 400; renaming an archived portfolio is a *non-field*
lifecycle ``{"detail": ...}`` 400 — the two shapes must stay distinguishable.
Cross-user attempts get the concealed 404 and never touch the row, unsafe
requests require CSRF, and the database-constraint race falls back to the same
clean field-level 400 as create.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from portfolios.api.views import RENAME_WHILE_ARCHIVED_MESSAGE
from portfolios.models import Portfolio

pytestmark = pytest.mark.django_db


def _url(pk: int) -> str:
    return f"/api/v1/portfolios/{pk}/"


def test_active_rename_returns_the_canonical_trimmed_name(
    auth_client: APIClient, portfolio: Portfolio
) -> None:
    response = auth_client.patch(_url(portfolio.pk), {"name": "  Renamed  "}, format="json")

    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"
    portfolio.refresh_from_db()
    assert portfolio.name == "Renamed"


def test_rename_to_the_current_name_succeeds(auth_client: APIClient, portfolio: Portfolio) -> None:
    response = auth_client.patch(_url(portfolio.pk), {"name": portfolio.name}, format="json")

    assert response.status_code == 200
    assert response.json()["name"] == portfolio.name


def test_casing_only_self_rename_succeeds(auth_client: APIClient, portfolio: Portfolio) -> None:
    response = auth_client.patch(_url(portfolio.pk), {"name": "GROWTH"}, format="json")

    assert response.status_code == 200
    assert response.json()["name"] == "GROWTH"
    portfolio.refresh_from_db()
    assert portfolio.name == "GROWTH"


def test_rename_to_another_portfolios_name_is_a_field_400(
    auth_client: APIClient, user: User, portfolio: Portfolio
) -> None:
    Portfolio.objects.create(owner=user, name="Income")

    response = auth_client.patch(_url(portfolio.pk), {"name": "income"}, format="json")

    assert response.status_code == 400
    assert "name" in response.json()
    portfolio.refresh_from_db()
    assert portfolio.name == "Growth"


def test_rename_while_archived_is_a_non_field_lifecycle_400(
    auth_client: APIClient, archived_portfolio: Portfolio
) -> None:
    response = auth_client.patch(_url(archived_portfolio.pk), {"name": "Revived"}, format="json")

    assert response.status_code == 400
    body = response.json()
    # The lifecycle rejection is a non-field detail error — distinguishable from
    # a ``name`` field error by shape, not just by message.
    assert body == {"detail": RENAME_WHILE_ARCHIVED_MESSAGE}
    assert "name" not in body
    archived_portfolio.refresh_from_db()
    assert archived_portfolio.name == "Retired"


def test_cross_user_rename_is_a_concealed_404_and_leaves_the_row(
    other_auth_client: APIClient, portfolio: Portfolio
) -> None:
    response = other_auth_client.patch(_url(portfolio.pk), {"name": "Hijacked"}, format="json")

    assert response.status_code == 404
    portfolio.refresh_from_db()
    assert portfolio.name == "Growth"


def test_anonymous_rename_is_401(client: APIClient, portfolio: Portfolio) -> None:
    response = client.patch(_url(portfolio.pk), {"name": "Nope"}, format="json")

    assert response.status_code == 401
    portfolio.refresh_from_db()
    assert portfolio.name == "Growth"


def test_rename_requires_csrf(
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

    response = csrf_client.patch(_url(portfolio.pk), {"name": "Renamed"}, format="json")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF verification failed."}
    portfolio.refresh_from_db()
    assert portfolio.name == "Growth"


def test_rename_uniqueness_race_is_translated_to_400_not_500(
    auth_client: APIClient,
    user: User,
    portfolio: Portfolio,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Neutralise the serializer's duplicate pre-check so a colliding name reaches
    # the database constraint, exercising the ``IntegrityError`` branch of
    # ``perform_update``. The replacement still trims, mirroring the real return.
    monkeypatch.setattr(
        "portfolios.api.serializers.PortfolioSerializer.validate_name",
        lambda self, value: value.strip(),
    )
    Portfolio.objects.create(owner=user, name="Income")

    response = auth_client.patch(_url(portfolio.pk), {"name": "income"}, format="json")

    # The constraint violation is caught and re-raised as a field-level 400, never
    # surfacing as an unhandled 500 — and the savepoint keeps the surrounding
    # test transaction usable, which the follow-up queries prove.
    assert response.status_code == 400
    assert "name" in response.json()
    portfolio.refresh_from_db()
    assert portfolio.name == "Growth"
    assert Portfolio.objects.filter(owner=user).count() == 2
