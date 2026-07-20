"""Serializers for the session-authentication endpoints.

These deliberately expose the smallest possible surface: registration and login
accept only ``email`` and ``password``; the current-user representation returns
only ``id`` and ``email``. Nothing here ever reads back or serialises a
password, a password hash, or any internal authorisation state.
"""

from __future__ import annotations

from typing import Any

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from accounts.models import User


class RegistrationSerializer(serializers.Serializer[User]):
    """Validate and create a new user from ``email`` and ``password`` alone."""

    email = serializers.EmailField()
    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={"input_type": "password"},
    )

    def validate_email(self, value: str) -> str:
        # Canonicalize first, then check uniqueness on the canonical value so a
        # case/whitespace variant of an existing address is rejected here with a
        # safe, field-level message rather than reaching the database.
        email = User.objects.canonicalize_email(value)
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return email

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        # Run every configured Django password validator against an *unsaved*
        # candidate carrying the (canonicalized) email, so attribute-similarity
        # checks work without persisting anything.
        candidate = User(email=attrs.get("email", ""))
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc
        return attrs

    def create(self, validated_data: Any) -> User:
        return User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
        )


class LoginSerializer(serializers.Serializer[User]):
    """Validate login input, canonicalizing the email for the lookup."""

    email = serializers.EmailField()
    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={"input_type": "password"},
    )

    def validate_email(self, value: str) -> str:
        return User.objects.canonicalize_email(value)


class CurrentUserSerializer(serializers.Serializer[User]):
    """Public representation of the authenticated user: ``id`` and ``email``."""

    id = serializers.IntegerField(read_only=True)
    email = serializers.EmailField(read_only=True)
