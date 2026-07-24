"""URL configuration for the versioned public API mounted at ``/api/v1/``."""

from django.urls import include, path

from core.api.health import HealthView, ReadinessView

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("health/ready/", ReadinessView.as_view(), name="health-ready"),
    path("auth/", include("accounts.api.urls")),
    path("", include("portfolios.api.urls")),
]
