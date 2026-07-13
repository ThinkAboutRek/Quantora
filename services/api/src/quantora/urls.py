"""Root URL configuration for the Quantora API project.

Only two entry points are mounted here: the Django admin and the versioned
public API. All application endpoints live under ``api/v1/`` via ``core.api``.
"""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("core.api.urls")),
]
