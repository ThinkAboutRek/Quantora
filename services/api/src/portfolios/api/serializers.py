"""Serializer for the portfolio endpoints.

A single :class:`PortfolioSerializer` handles read, create, and rename. The
write surface is intentionally tiny — only ``name`` is client-settable;
``owner`` is never a serializer field (ownership is assigned server-side in the
view), ``base_currency`` is read-only (fixed to USD), and ``is_archived`` is
read-only because archival changes state only through the explicit archive and
unarchive actions. ``validate_name`` trims the value and rejects a
case-insensitive duplicate scoped to the owner — across active *and* archived
portfolios — before the request ever reaches the database's uniqueness
constraint. On a rename the owner is derived from the instance and the instance
itself is excluded, so re-saving the same name (or changing only its casing)
passes while a name held by any other portfolio of the same owner is rejected.
"""

from __future__ import annotations

from django.db.models.functions import Lower
from rest_framework import serializers

from portfolios.models import Portfolio


class PortfolioSerializer(serializers.ModelSerializer[Portfolio]):
    """Read/write representation of a portfolio owned by the current user."""

    class Meta:
        model = Portfolio
        fields = ["id", "name", "base_currency", "is_archived", "created_at", "updated_at"]
        read_only_fields = ["id", "base_currency", "is_archived", "created_at", "updated_at"]

    def validate_name(self, value: str) -> str:
        # DRF's CharField already trims surrounding whitespace, but strip again so
        # the stored value is trimmed regardless of that field-level setting, and
        # so a value that is blank only after trimming is rejected here too.
        name = value.strip()
        if not name:
            raise serializers.ValidationError("This field may not be blank.")

        # Case-insensitive duplicate guard scoped to the owner, over every state
        # (active and archived). Lowering the stored name in the database (LOWER
        # via annotate) and comparing to the lowered candidate mirrors the model's
        # functional unique constraint, so a normal request is rejected here with
        # a friendly field error rather than reaching — and tripping — the
        # database constraint. On a rename the owner comes from the instance and
        # the instance is excluded, so a same-name or casing-only self-rename
        # passes.
        if self.instance is not None:
            candidates = Portfolio.objects.filter(owner=self.instance.owner).exclude(
                pk=self.instance.pk
            )
        else:
            candidates = Portfolio.objects.filter(owner=self.context["request"].user)
        duplicate = (
            candidates.annotate(name_lower=Lower("name")).filter(name_lower=name.lower()).exists()
        )
        if duplicate:
            raise serializers.ValidationError("You already have a portfolio with this name.")

        return name
