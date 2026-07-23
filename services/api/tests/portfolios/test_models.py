"""Model-level behaviour for :class:`portfolios.models.Portfolio`.

These exercise persistence, defaults, ordering, and the two database
constraints (the USD check and the per-owner case-insensitive uniqueness). Every
expected ``IntegrityError`` is provoked inside its own ``transaction.atomic()``
block so the surrounding pytest transaction stays usable afterwards.

Note: SQLite's ``LOWER()`` folds ASCII only, so the case-insensitivity proven
here is ASCII case-insensitivity. Full Unicode case folding is a PostgreSQL
concern verified manually against the deployed database, not in this suite.
"""

from __future__ import annotations

import pytest
from django.db import IntegrityError, transaction

from accounts.models import User
from portfolios.models import Portfolio

pytestmark = pytest.mark.django_db


def test_owner_is_required() -> None:
    with transaction.atomic(), pytest.raises(IntegrityError):
        Portfolio.objects.create(name="Ownerless")


def test_name_is_persisted(user: User) -> None:
    portfolio = Portfolio.objects.create(owner=user, name="Growth")

    portfolio.refresh_from_db()
    assert portfolio.name == "Growth"
    assert portfolio.owner == user


def test_base_currency_defaults_to_usd(user: User) -> None:
    portfolio = Portfolio.objects.create(owner=user, name="Defaulted")

    assert portfolio.base_currency == "USD"


def test_is_archived_defaults_to_false(user: User) -> None:
    portfolio = Portfolio.objects.create(owner=user, name="Fresh")

    portfolio.refresh_from_db()
    assert portfolio.is_archived is False


def test_timestamps_are_populated(user: User) -> None:
    portfolio = Portfolio.objects.create(owner=user, name="Timestamped")

    assert portfolio.created_at is not None
    assert portfolio.updated_at is not None


def test_default_ordering_is_newest_first(user: User) -> None:
    first = Portfolio.objects.create(owner=user, name="First")
    second = Portfolio.objects.create(owner=user, name="Second")
    third = Portfolio.objects.create(owner=user, name="Third")

    # ``-created_at, -id``: the most recently created row comes first, and the
    # descending id is the deterministic tie-breaker when timestamps coincide.
    assert list(Portfolio.objects.all()) == [third, second, first]


def test_base_currency_check_rejects_non_usd(user: User) -> None:
    with transaction.atomic(), pytest.raises(IntegrityError):
        Portfolio.objects.create(owner=user, name="Euros", base_currency="EUR")


def test_case_insensitive_duplicate_rejected_for_one_owner(user: User) -> None:
    Portfolio.objects.create(owner=user, name="Growth")

    with transaction.atomic(), pytest.raises(IntegrityError):
        Portfolio.objects.create(owner=user, name="growth")


def test_archived_rows_still_count_toward_uniqueness(user: User) -> None:
    # Archival does not release the name: the functional unique constraint spans
    # every state, so an archived "Growth" still blocks a new "growth".
    Portfolio.objects.create(owner=user, name="Growth", is_archived=True)

    with transaction.atomic(), pytest.raises(IntegrityError):
        Portfolio.objects.create(owner=user, name="growth")


def test_same_name_allowed_for_different_owners(user: User, other_user: User) -> None:
    first = Portfolio.objects.create(owner=user, name="Growth")
    second = Portfolio.objects.create(owner=other_user, name="Growth")

    assert first.pk != second.pk
    assert Portfolio.objects.filter(name="Growth").count() == 2
