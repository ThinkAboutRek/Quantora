"""Migration-state consistency check."""

import pytest
from django.core.management import call_command


@pytest.mark.django_db
def test_no_missing_migrations() -> None:
    # ``--check`` raises SystemExit(1) if the model state and the committed
    # migrations have diverged; ``--dry-run`` guarantees nothing is written.
    # The mark is required because ``makemigrations`` reads the migration
    # history table to check for a consistent applied history.
    call_command("makemigrations", check=True, dry_run=True, verbosity=0)
