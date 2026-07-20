"""URL routes for the session-authentication endpoints.

Included under ``auth/`` by :mod:`core.api.urls`, so the effective paths are
``/api/v1/auth/csrf/``, ``.../register/``, ``.../login/``, ``.../logout/`` and
``.../me/``.
"""

from django.urls import path

from accounts.api.views import (
    CsrfView,
    LoginView,
    LogoutView,
    MeView,
    RegisterView,
)

urlpatterns = [
    path("csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("register/", RegisterView.as_view(), name="auth-register"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
]
