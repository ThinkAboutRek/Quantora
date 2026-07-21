"""Serializer for the portfolio collection endpoint.

A single :class:`PortfolioSerializer` handles both read and write. The write
surface is intentionally tiny — only ``name`` is client-settable; ``owner`` is
never a serializer field (ownership is assigned server-side in the view) and
``base_currency`` is read-only (fixed to USD in Phase 8). ``validate_name``
trims the value and rejects a case-insensitive duplicate scoped to the current
user before the request ever reaches the database's uniqueness constraint.
"""

from __future__ import annotations

from django.db.models.functions import Lower
from rest_framework import serializers

from portfolios.models import Portfolio


class PortfolioSerializer(serializers.ModelSerializer[Portfolio]):
    """Read/write representation of a portfolio owned by the current user."""

    class Meta:
        model = Portfolio
        fields = ["id", "name", "base_currency", "created_at", "updated_at"]
        read_only_fields = ["id", "base_currency", "created_at", "updated_at"]

    def validate_name(self, value: str) -> str:
        # DRF's CharField already trims surrounding whitespace, but strip again so
        # the stored value is trimmed regardless of that field-level setting, and
        # so a value that is blank only after trimming is rejected here too.
        name = value.strip()
        if not name:
            raise serializers.ValidationError("This field may not be blank.")

        # Case-insensitive duplicate guard scoped to the requesting user. Lowering
        # the stored name in the database (LOWER via annotate) and comparing to the
        # lowered candidate mirrors the model's functional unique constraint, so a
        # normal request is rejected here with a friendly field error rather than
        # reaching — and tripping — the database constraint.
        user = self.context["request"].user
        duplicate = (
            Portfolio.objects.filter(owner=user)
            .annotate(name_lower=Lower("name"))
            .filter(name_lower=name.lower())
            .exists()
        )
        if duplicate:
            raise serializers.ValidationError("You already have a portfolio with this name.")

        return name
