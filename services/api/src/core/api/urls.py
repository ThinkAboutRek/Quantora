"""URL configuration for the versioned public API mounted at ``/api/v1/``."""

from django.urls import include, path

from core.api.health import HealthView

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("auth/", include("accounts.api.urls")),
]
