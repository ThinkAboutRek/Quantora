"""Tests for the public readiness endpoint.

Readiness is the database-backed probe: 200 with a fixed body when ``SELECT 1``
answers, 503 with a fixed body when it does not. The failure body must never
carry driver messages or any other internal detail, and the broken connection
must be closed so a later request can recover.
"""

from unittest import mock

import pytest
from django.db import OperationalError, connection
from rest_framework import status
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

URL = "/api/v1/health/ready/"


def test_anonymous_readiness_returns_200_when_database_available() -> None:
    # No credentials are ever set on the client.
    response = APIClient().get(URL)

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"status": "ready", "service": "quantora-api"}
    assert response["Cache-Control"] == "no-store"


def test_database_failure_returns_503() -> None:
    with (
        mock.patch.object(connection, "cursor", side_effect=OperationalError("boom")),
        mock.patch.object(connection, "close"),
    ):
        response = APIClient().get(URL)

    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert response["Cache-Control"] == "no-store"


def test_failure_body_contains_no_internal_detail() -> None:
    # The simulated driver error carries a distinctive message; none of it may
    # surface. The body is exactly the two fixed keys and nothing else.
    with (
        mock.patch.object(
            connection,
            "cursor",
            side_effect=OperationalError("host=secret-db-host password=hunter2"),
        ),
        mock.patch.object(connection, "close"),
    ):
        response = APIClient().get(URL)

    body = response.json()
    assert set(body) == {"status", "service"}
    assert body == {"status": "unavailable", "service": "quantora-api"}


def test_connection_is_closed_after_failure() -> None:
    with (
        mock.patch.object(connection, "cursor", side_effect=OperationalError("boom")),
        mock.patch.object(connection, "close") as close,
    ):
        response = APIClient().get(URL)

    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    close.assert_called_once_with()


def test_liveness_contract_is_unchanged_and_database_independent() -> None:
    # The liveness endpoint keeps its exact body AND stays database-free: even
    # with the cursor broken it must still answer 200.
    with mock.patch.object(connection, "cursor", side_effect=OperationalError("boom")):
        response = APIClient().get("/api/v1/health/")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"status": "ok", "service": "quantora-api"}
