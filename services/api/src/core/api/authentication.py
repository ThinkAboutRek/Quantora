"""Session authentication hardened for a credentialed JSON API.

This subclass keeps every security property of DRF's stock
:class:`~rest_framework.authentication.SessionAuthentication` — the
database-backed session check and full CSRF enforcement for authenticated
unsafe requests — and changes only two client-facing behaviours:

* ``authenticate_header`` advertises a ``Session`` scheme so an anonymous
  request to a protected endpoint yields ``401 Unauthorized`` with a
  ``WWW-Authenticate`` header, rather than DRF's default bare ``403``.
* ``enforce_csrf`` collapses Django's internal CSRF failure *reason* into a
  single generic message, so the precise rejection cause is never disclosed to
  the client.
"""

from __future__ import annotations

from rest_framework import authentication, exceptions
from rest_framework.request import Request


class SessionAuthentication(authentication.SessionAuthentication):
    """DRF session auth that returns 401 and hides the CSRF failure reason."""

    def authenticate_header(self, request: Request) -> str:
        # Returning a scheme makes DRF treat missing credentials as 401 (with a
        # ``WWW-Authenticate`` header) instead of 403.
        return "Session"

    def enforce_csrf(self, request: Request) -> None:
        # Preserve the parent's real CSRF check, but translate any failure into
        # a generic message. Django's reason strings (e.g. "Referer checking
        # failed") are diagnostic detail the client has no need to see.
        try:
            super().enforce_csrf(request)
        except exceptions.PermissionDenied as exc:
            raise exceptions.PermissionDenied("CSRF verification failed.") from exc
