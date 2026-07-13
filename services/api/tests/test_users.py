"""Tests for the custom email-based user model and its manager."""

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from accounts.models import User

pytestmark = pytest.mark.django_db


def test_create_user_persists_email_user() -> None:
    user = User.objects.create_user(email="trader@example.com", password="pw-12345678")

    assert user.pk is not None
    assert user.email == "trader@example.com"
    assert user.is_staff is False
    assert user.is_superuser is False
    assert user.check_password("pw-12345678") is True


def test_create_superuser_sets_flags() -> None:
    admin = User.objects.create_superuser(email="admin@example.com", password="pw-12345678")

    assert admin.is_staff is True
    assert admin.is_superuser is True


def test_create_superuser_rejects_non_staff() -> None:
    with pytest.raises(ValueError, match="is_staff=True"):
        User.objects.create_superuser(
            email="admin@example.com", password="pw-12345678", is_staff=False
        )


def test_email_is_normalized() -> None:
    # normalize_email lowercases the domain but leaves the local part untouched.
    user = User.objects.create_user(email="Trader@Example.COM", password="pw-12345678")

    assert user.email == "Trader@example.com"


def test_blank_email_rejected() -> None:
    with pytest.raises(ValueError, match="email address"):
        User.objects.create_user(email="", password="pw-12345678")


def test_duplicate_email_rejected() -> None:
    User.objects.create_user(email="dupe@example.com", password="pw-12345678")

    with pytest.raises(IntegrityError):
        User.objects.create_user(email="dupe@example.com", password="pw-12345678")


def test_username_field_is_email() -> None:
    assert User.USERNAME_FIELD == "email"


def test_model_has_no_username_field() -> None:
    field_names = {field.name for field in User._meta.get_fields()}

    assert "username" not in field_names


def test_get_user_model_resolves_to_accounts_user() -> None:
    assert get_user_model() is User
