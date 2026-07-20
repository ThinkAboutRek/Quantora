"""Custom error views wired into Django's request handling.

:func:`csrf_failure` replaces Django's HTML CSRF error page with a compact JSON
body, so that a CSRF rejection on this JSON API returns a machine-readable
response instead of a rendered template. It is wired through the
``CSRF_FAILURE_VIEW`` setting.
"""

from __future__ import annotations

from django.http import HttpRequest, JsonResponse


def csrf_failure(request: HttpRequest, reason: str = "") -> JsonResponse:
    """Return a generic JSON ``403`` for a failed CSRF check.

    The ``reason`` Django passes in — along with any cookie, token, or session
    state — is deliberately discarded. The body carries only a fixed, generic
    message so the response never discloses *why* the check failed.
    """
    return JsonResponse({"detail": "CSRF verification failed."}, status=403)
