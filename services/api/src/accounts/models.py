"""The custom, email-based user model and its manager.

Quantora authenticates users by email address, not username. ``User`` drops the
inherited ``username`` column entirely and uses a unique ``email`` as the
identifier; ``UserManager`` provides the matching email-oriented creation API.
"""

from __future__ import annotations

from typing import Any, ClassVar

from django.contrib.auth.models import AbstractUser
from django.contrib.auth.models import UserManager as DjangoUserManager
from django.db import models


class UserManager(DjangoUserManager["User"]):
    """Create :class:`User` instances keyed by email instead of username."""

    use_in_migrations = True

    @staticmethod
    def canonicalize_email(email: str | None) -> str:
        """Return the canonical login form of ``email``.

        Surrounding whitespace is stripped and the *entire* address — local
        part included, not just the domain that Django's ``normalize_email``
        lowercases — is folded to lower case. Applying this on every write path
        and on the login lookup makes the identifier case-insensitive: addresses
        that differ only in case or padding collapse to one stored value, so the
        existing ``unique`` constraint on ``email`` enforces case-insensitive
        uniqueness with no schema change.
        """
        return (email or "").strip().lower()

    def get_by_natural_key(self, username: str | None) -> User:
        # Django's authentication framework looks users up by their natural key
        # (the email). Canonicalizing here makes the login lookup match the
        # canonical form persisted by ``_create_user``.
        return super().get_by_natural_key(self.canonicalize_email(username))

    def _create_user(self, email: str, password: str | None, **extra_fields: Any) -> User:
        email = self.canonicalize_email(email)
        if not email:
            raise ValueError("Users must have an email address.")
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    # The email-first signature is deliberately incompatible with the stock
    # username-based manager, so the Liskov override check is suppressed here.
    def create_user(  # type: ignore[override]
        self, email: str, password: str | None = None, **extra_fields: Any
    ) -> User:
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(  # type: ignore[override]
        self, email: str, password: str | None = None, **extra_fields: Any
    ) -> User:
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    """A user identified by a unique email address.

    Retains the groups/permissions behaviour inherited from ``AbstractUser``;
    only the username-based identity is replaced.
    """

    username = None  # type: ignore[assignment]
    email = models.EmailField("email address", unique=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    objects: ClassVar[UserManager] = UserManager()

    def __str__(self) -> str:
        return self.email
