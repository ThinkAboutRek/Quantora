"""Validation and field-exposure behaviour of :class:`PortfolioSerializer`.

The serializer is always used with a request in context (the view supplies it),
so these tests build a request via :class:`APIRequestFactory` and attach the
owning user before validating.
"""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from accounts.models import User
from portfolios.api.serializers import PortfolioSerializer
from portfolios.models import Portfolio

pytestmark = pytest.mark.django_db

_factory = APIRequestFactory()


def _serializer(user: User, data: dict[str, Any]) -> PortfolioSerializer:
    request: Request = _factory.post("/api/v1/portfolios/", data, format="json")
    request.user = user
    return PortfolioSerializer(data=data, context={"request": request})


def _rename_serializer(instance: Portfolio, data: dict[str, Any]) -> PortfolioSerializer:
    request: Request = _factory.patch(f"/api/v1/portfolios/{instance.pk}/", data, format="json")
    request.user = instance.owner
    return PortfolioSerializer(instance, data=data, partial=True, context={"request": request})


def test_trims_surrounding_whitespace_and_stores_trimmed(user: User) -> None:
    serializer = _serializer(user, {"name": "  Retirement  "})

    assert serializer.is_valid(), serializer.errors
    portfolio = serializer.save(owner=user)
    assert portfolio.name == "Retirement"


def test_rejects_blank_after_trim(user: User) -> None:
    serializer = _serializer(user, {"name": "   "})

    assert not serializer.is_valid()
    assert "name" in serializer.errors


def test_rejects_over_length_name(user: User) -> None:
    serializer = _serializer(user, {"name": "x" * 121})

    assert not serializer.is_valid()
    assert "name" in serializer.errors


def test_rejects_case_insensitive_duplicate_for_current_owner(user: User) -> None:
    Portfolio.objects.create(owner=user, name="Growth")
    serializer = _serializer(user, {"name": "growth"})

    assert not serializer.is_valid()
    assert "name" in serializer.errors


def test_allows_a_different_owner_the_same_name(user: User, other_user: User) -> None:
    Portfolio.objects.create(owner=user, name="Growth")
    serializer = _serializer(other_user, {"name": "Growth"})

    assert serializer.is_valid(), serializer.errors


def test_owner_is_not_writable(user: User, other_user: User) -> None:
    serializer = _serializer(user, {"name": "Scoped", "owner": other_user.pk})

    assert serializer.is_valid(), serializer.errors
    # ``owner`` is not a serializer field, so a value in the payload is discarded.
    assert "owner" not in serializer.validated_data


def test_base_currency_is_not_writable(user: User) -> None:
    serializer = _serializer(user, {"name": "Fixed", "base_currency": "EUR"})

    assert serializer.is_valid(), serializer.errors
    assert "base_currency" not in serializer.validated_data
    portfolio = serializer.save(owner=user)
    assert portfolio.base_currency == "USD"


def test_is_archived_is_not_writable(user: User) -> None:
    serializer = _serializer(user, {"name": "Sneaky", "is_archived": True})

    assert serializer.is_valid(), serializer.errors
    assert "is_archived" not in serializer.validated_data
    portfolio = serializer.save(owner=user)
    assert portfolio.is_archived is False


def test_rename_to_the_same_stored_name_passes(user: User) -> None:
    portfolio = Portfolio.objects.create(owner=user, name="Growth")
    serializer = _rename_serializer(portfolio, {"name": "Growth"})

    assert serializer.is_valid(), serializer.errors


def test_casing_only_self_rename_passes(user: User) -> None:
    portfolio = Portfolio.objects.create(owner=user, name="Growth")
    serializer = _rename_serializer(portfolio, {"name": "GROWTH"})

    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["name"] == "GROWTH"


def test_rename_rejects_a_name_held_by_another_portfolio(user: User) -> None:
    Portfolio.objects.create(owner=user, name="Growth")
    portfolio = Portfolio.objects.create(owner=user, name="Income")
    serializer = _rename_serializer(portfolio, {"name": "growth"})

    assert not serializer.is_valid()
    assert "name" in serializer.errors


def test_rename_duplicate_check_includes_archived_portfolios(user: User) -> None:
    # The duplicate scope is the owner's full set — an archived portfolio still
    # holds its name against a rename.
    Portfolio.objects.create(owner=user, name="Retired", is_archived=True)
    portfolio = Portfolio.objects.create(owner=user, name="Income")
    serializer = _rename_serializer(portfolio, {"name": "retired"})

    assert not serializer.is_valid()
    assert "name" in serializer.errors


def test_create_duplicate_check_includes_archived_portfolios(user: User) -> None:
    Portfolio.objects.create(owner=user, name="Retired", is_archived=True)
    serializer = _serializer(user, {"name": "retired"})

    assert not serializer.is_valid()
    assert "name" in serializer.errors
