"""Liveness and readiness health-check endpoints.

Liveness (:class:`HealthView`) is a dependency-free probe: it performs no
database or cache access and returns a stable JSON body, so it reports only
that the process is up. Readiness (:class:`ReadinessView`) additionally proves
the database answers the smallest real round trip. Both are deliberately
public (``AllowAny``) so that uptime and load-balancer checks never need
credentials, and neither body ever carries a hostname, credential, or
exception detail.
"""

from django.db import Error as DatabaseError
from django.db import connection
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    """Return a static ``200 OK`` payload identifying the service."""

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        return Response({"status": "ok", "service": "quantora-api"})


class ReadinessView(APIView):
    """Report whether the service can actually answer queries.

    Runs ``SELECT 1`` through a cursor — the smallest real database round trip.
    Only :class:`django.db.Error` is caught, so a genuine programming fault
    still surfaces as a 500. On failure the Django connection is closed, which
    discards the broken socket so a later request reconnects cleanly once
    PostgreSQL returns. ``Cache-Control: no-store`` keeps every intermediary
    from replaying a stale verdict.
    """

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except DatabaseError:
            # The body is fixed: no driver message, hostname, or exception
            # text may leak through this public, unauthenticated endpoint.
            connection.close()
            response = Response({"status": "unavailable", "service": "quantora-api"}, status=503)
        else:
            response = Response({"status": "ready", "service": "quantora-api"})
        response["Cache-Control"] = "no-store"
        return response
