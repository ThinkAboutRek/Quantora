"""Portfolio collection endpoint.

``PortfolioListCreateView`` lists the requesting user's portfolios and creates a
new one for them. Ownership is never taken from the request body — it is bound
server-side from the session user — and the queryset is always scoped to that
user, so one account can neither see nor create rows against another. Pagination
is disabled so the list stays a plain JSON array.
"""

from __future__ import annotations

from typing import cast

from django.db import IntegrityError, transaction
from django.db.models import QuerySet
from django.db.models.functions import Lower
from rest_framework import serializers
from rest_framework.generics import ListCreateAPIView

from accounts.models import User
from portfolios.api.serializers import PortfolioSerializer
from portfolios.models import Portfolio


class PortfolioListCreateView(ListCreateAPIView[Portfolio]):
    """GET the current user's portfolios; POST creates one they own."""

    serializer_class = PortfolioSerializer
    # Explicitly opt out of pagination so the collection is returned as a bare
    # array even if a global pagination class is introduced later.
    pagination_class = None

    def get_queryset(self) -> QuerySet[Portfolio]:
        # IsAuthenticated guarantees a concrete user; scope every read to that
        # owner so all rows are never exposed.
        owner = cast(User, self.request.user)
        return Portfolio.objects.filter(owner=owner)

    def perform_create(self, serializer: serializers.BaseSerializer[Portfolio]) -> None:
        owner = cast(User, self.request.user)
        try:
            with transaction.atomic():
                serializer.save(owner=owner)
        except IntegrityError as exc:
            # The serializer's pre-check normally stops duplicates first, so this
            # branch only runs on a genuine race: two concurrent creates of the
            # same case-insensitive name. Translate exactly that case into the same
            # field-level 400 the serializer would have returned; re-raise anything
            # else so a real integrity fault is never masked as a validation error.
            name_lower = serializer.validated_data["name"].lower()
            duplicate = (
                Portfolio.objects.filter(owner=owner)
                .annotate(name_lower=Lower("name"))
                .filter(name_lower=name_lower)
                .exists()
            )
            if duplicate:
                raise serializers.ValidationError(
                    {"name": ["You already have a portfolio with this name."]}
                ) from exc
            raise
