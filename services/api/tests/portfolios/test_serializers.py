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
