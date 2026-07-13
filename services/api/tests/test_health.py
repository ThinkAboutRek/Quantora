"""Tests for the public health endpoint."""

from rest_framework import status
from rest_framework.test import APIClient


def test_health_returns_ok_body() -> None:
    response = APIClient().get("/api/v1/health/")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"status": "ok", "service": "quantora-api"}


def test_health_requires_no_authentication() -> None:
    # No credentials are ever set on the client.
    response = APIClient().get("/api/v1/health/")

    assert response.status_code == status.HTTP_200_OK
