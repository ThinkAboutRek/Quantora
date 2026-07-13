"""Verify the migrated schema uses the custom user table, not the default one."""

import pytest
from django.db import connection


@pytest.mark.django_db
def test_custom_user_table_present_and_default_absent() -> None:
    tables = set(connection.introspection.table_names())

    assert "accounts_user" in tables
    assert "auth_user" not in tables
