"""Owner scoping for every portfolio endpoint.

The single mixin here is the authorization boundary for the portfolio API: its
``get_queryset`` returns the requesting user's portfolios — active *and*
archived — and nothing else. DRF's ``get_object`` performs every detail lookup
against this queryset, so a portfolio owned by someone else and a portfolio that
does not exist follow the identical 404 path, and no archived-state or lifecycle
logic ever runs for a row the user does not own. There is deliberately no
object-permission class; scoping the queryset is the whole mechanism.
"""

from __future__ import annotations

from typing import cast

from django.db.models import QuerySet
from rest_framework.generics import GenericAPIView

from accounts.models import User
from portfolios.models import Portfolio


class OwnedPortfolioQuerySetMixin(GenericAPIView[Portfolio]):
    """Restrict a portfolio view's queryset to the requesting user's rows.

    Derived from ``GenericAPIView[Portfolio]`` so ``self.request`` carries the
    DRF request type under strict mypy; every concrete portfolio view already
    inherits that base, so this adds no behaviour beyond the scoped queryset.

    The base queryset applies no ``is_archived`` filter: detail lookups,
    lifecycle actions, and uniqueness checks must all see the owner's
    portfolios in every state. Views that list only one state (e.g. the
    collection endpoint) layer their filter on top of this base.
    """

    def get_queryset(self) -> QuerySet[Portfolio]:
        # IsAuthenticated guarantees a concrete user; scope every lookup to that
        # owner so other users' rows are unreachable by construction.
        owner = cast(User, self.request.user)
        return Portfolio.objects.filter(owner=owner)
