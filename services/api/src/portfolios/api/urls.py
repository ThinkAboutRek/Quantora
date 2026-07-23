"""URL routes for the portfolio endpoints.

Included by :mod:`core.api.urls`, so the effective paths live under
``/api/v1/``. The four routes are declared by hand — no router — because the
surface is deliberately explicit: a collection, a detail, and the two lifecycle
actions. There are no other actions.
"""

from django.urls import path

from portfolios.api.views import (
    PortfolioArchiveView,
    PortfolioDetailView,
    PortfolioListCreateView,
    PortfolioUnarchiveView,
)

urlpatterns = [
    path("portfolios/", PortfolioListCreateView.as_view(), name="portfolio-list-create"),
    path("portfolios/<int:pk>/", PortfolioDetailView.as_view(), name="portfolio-detail"),
    path("portfolios/<int:pk>/archive/", PortfolioArchiveView.as_view(), name="portfolio-archive"),
    path(
        "portfolios/<int:pk>/unarchive/",
        PortfolioUnarchiveView.as_view(),
        name="portfolio-unarchive",
    ),
]
