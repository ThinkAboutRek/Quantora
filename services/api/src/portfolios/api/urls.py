"""URL routes for the portfolio collection endpoint.

Included by :mod:`core.api.urls`, so the effective path is
``/api/v1/portfolios/``. Only the collection route exists in Phase 8; there is
no detail route.
"""

from django.urls import path

from portfolios.api.views import PortfolioListCreateView

urlpatterns = [
    path("portfolios/", PortfolioListCreateView.as_view(), name="portfolio-list-create"),
]
