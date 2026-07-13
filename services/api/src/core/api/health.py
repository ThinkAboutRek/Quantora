"""Liveness/health-check endpoint.

A dependency-free probe: it performs no database or cache access and returns a
stable JSON body. It is deliberately public (``AllowAny``) so that uptime and
load-balancer checks never need credentials.
"""

from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    """Return a static ``200 OK`` payload identifying the service."""

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        return Response({"status": "ok", "service": "quantora-api"})
