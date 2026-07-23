"""Portfolio endpoints: collection, detail, and the two lifecycle actions.

Every view layers on :class:`~portfolios.api.mixins.OwnedPortfolioQuerySetMixin`,
so each detail lookup runs against the requesting user's portfolios (active and
archived) and a non-owned id is indistinguishable from a nonexistent one — the
same concealed 404, before any lifecycle logic. Ownership is never taken from
the request body; it is bound server-side from the session user.

The lifecycle is deliberately explicit: ``is_archived`` is not writable through
the serializer, PUT is not offered, and the only state transitions are the
dedicated archive and unarchive POST actions, which are idempotent. Renames are
allowed only while active; permanent deletion only while archived. Lifecycle
rejections are non-field ``{"detail": ...}`` 400s — distinct from the
field-level ``{"name": [...]}`` validation shape — matching the JSON error
contract used across the API.
"""

from __future__ import annotations

from typing import Any, cast

from django.db import IntegrityError, transaction
from django.db.models import QuerySet
from django.db.models.functions import Lower
from rest_framework import serializers
from rest_framework.generics import GenericAPIView, ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.request import Request
from rest_framework.response import Response

from accounts.models import User
from portfolios.api.mixins import OwnedPortfolioQuerySetMixin
from portfolios.api.serializers import PortfolioSerializer
from portfolios.models import Portfolio

DUPLICATE_NAME_MESSAGE = "You already have a portfolio with this name."
RENAME_WHILE_ARCHIVED_MESSAGE = "Unarchive the portfolio before renaming it."
DELETE_WHILE_ACTIVE_MESSAGE = "Archive the portfolio before deleting it."
INVALID_ARCHIVED_FILTER_MESSAGE = 'The "archived" filter must be "true" or "false".'


def _duplicate_name_exists(owner: User, name: str, *, exclude_pk: int | None = None) -> bool:
    """True if the owner already holds ``name`` case-insensitively, in any state.

    The check runs over the owner's full set of portfolios — active and archived
    — mirroring the database's functional unique constraint. ``exclude_pk``
    omits the row being renamed so a self-match is never a duplicate.
    """
    candidates = Portfolio.objects.filter(owner=owner)
    if exclude_pk is not None:
        candidates = candidates.exclude(pk=exclude_pk)
    return candidates.annotate(name_lower=Lower("name")).filter(name_lower=name.lower()).exists()


class PortfolioListCreateView(OwnedPortfolioQuerySetMixin, ListCreateAPIView[Portfolio]):
    """GET the current user's portfolios (one state at a time); POST creates one."""

    serializer_class = PortfolioSerializer
    # Explicitly opt out of pagination so the collection is returned as a bare
    # array even if a global pagination class is introduced later.
    pagination_class = None

    def get_queryset(self) -> QuerySet[Portfolio]:
        queryset = super().get_queryset()
        # Only the read path filters by state: the default list is the active
        # portfolios, ``?archived=true`` lists the archived ones. The create path
        # must keep the unfiltered owner-scoped base so its uniqueness re-query
        # sees every state.
        if self.request.method in ("GET", "HEAD"):
            return queryset.filter(is_archived=self._parse_archived_filter())
        return queryset

    def _parse_archived_filter(self) -> bool:
        """Strictly parse the ``archived`` query parameter for the list.

        Absent or empty means the active list. Otherwise only (case-insensitive)
        ``true`` and ``false`` are accepted; anything else is rejected with a
        non-field 400 rather than silently defaulting to a state the caller did
        not ask for.
        """
        raw = self.request.query_params.get("archived")
        if raw is None or raw == "":
            return False
        normalized = raw.lower()
        if normalized == "true":
            return True
        if normalized == "false":
            return False
        raise serializers.ValidationError({"detail": INVALID_ARCHIVED_FILTER_MESSAGE})

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
            if _duplicate_name_exists(owner, serializer.validated_data["name"]):
                raise serializers.ValidationError({"name": [DUPLICATE_NAME_MESSAGE]}) from exc
            raise


class PortfolioDetailView(OwnedPortfolioQuerySetMixin, RetrieveUpdateDestroyAPIView[Portfolio]):
    """GET, rename (PATCH), or permanently delete (DELETE) one owned portfolio.

    PUT is deliberately absent from ``http_method_names``, so a full replace
    returns 405 and the only write is the partial rename.
    """

    serializer_class = PortfolioSerializer
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        # Fetch once, and run the lifecycle gate before serializer validation so
        # an archived portfolio is rejected with the lifecycle message even when
        # the submitted name would also have failed validation.
        portfolio = self.get_object()
        if portfolio.is_archived:
            raise serializers.ValidationError({"detail": RENAME_WHILE_ARCHIVED_MESSAGE})
        serializer = self.get_serializer(portfolio, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def perform_update(self, serializer: serializers.BaseSerializer[Portfolio]) -> None:
        # Wrap only the save in a savepoint so a constraint violation aborts just
        # the write, leaving the surrounding transaction usable for the re-query.
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError as exc:
            # Same race backstop as create: classify the failure as a duplicate
            # name only if the expected duplicate actually exists (owner-scoped,
            # case-insensitive, over every state, excluding this row); anything
            # else re-raises so a real integrity fault is never masked.
            portfolio = cast(Portfolio, serializer.instance)
            name = serializer.validated_data.get("name")
            if name is not None and _duplicate_name_exists(
                portfolio.owner, name, exclude_pk=portfolio.pk
            ):
                raise serializers.ValidationError({"name": [DUPLICATE_NAME_MESSAGE]}) from exc
            raise

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        # Fetch once; the owner-scoped lookup 404s before this lifecycle gate, so
        # a non-owner can neither delete the row nor learn that it exists.
        portfolio = self.get_object()
        if not portfolio.is_archived:
            raise serializers.ValidationError({"detail": DELETE_WHILE_ACTIVE_MESSAGE})
        self.perform_destroy(portfolio)
        return Response(status=204)


class PortfolioArchiveView(OwnedPortfolioQuerySetMixin, GenericAPIView[Portfolio]):
    """POST: archive one owned portfolio. Idempotent; returns the current record."""

    serializer_class = PortfolioSerializer

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        portfolio = self.get_object()
        if not portfolio.is_archived:
            portfolio.is_archived = True
            portfolio.save(update_fields=["is_archived", "updated_at"])
        # An already-archived portfolio is left untouched — no save, so no
        # ``updated_at`` bump — and both cases return the authoritative record.
        serializer = self.get_serializer(portfolio)
        return Response(serializer.data)


class PortfolioUnarchiveView(OwnedPortfolioQuerySetMixin, GenericAPIView[Portfolio]):
    """POST: restore one owned archived portfolio. Idempotent; returns the record."""

    serializer_class = PortfolioSerializer

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        portfolio = self.get_object()
        if portfolio.is_archived:
            portfolio.is_archived = False
            portfolio.save(update_fields=["is_archived", "updated_at"])
        # Mirrors archive: a no-op transition returns 200 without a save.
        serializer = self.get_serializer(portfolio)
        return Response(serializer.data)
