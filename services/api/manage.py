#!/usr/bin/env python
"""Command-line entry point for the Quantora API Django project.

The project uses a ``src`` layout, so this script prepends ``src`` to
``sys.path`` before delegating to Django. That keeps ``services/api`` a
non-packaged workspace member while still allowing ``core`` and ``quantora``
to be imported as top-level packages at runtime.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def main() -> None:
    """Run administrative tasks."""
    src = Path(__file__).resolve().parent / "src"
    sys.path.insert(0, str(src))

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.development")

    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and available "
            "on your PYTHONPATH environment variable? Did you forget to "
            "activate a virtual environment?"
        ) from exc

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
