"""Typed readers for process environment variables.

A deliberately small helper — not a configuration framework. It reads values
from :data:`os.environ` with explicit types and fails loudly with
:class:`~django.core.exceptions.ImproperlyConfigured` when a required value is
missing or a value cannot be parsed.
"""

import os

from django.core.exceptions import ImproperlyConfigured

_TRUE_VALUES = frozenset({"true", "1", "yes", "on"})
_FALSE_VALUES = frozenset({"false", "0", "no", "off"})


def require_str(name: str) -> str:
    """Return the value of ``name``; raise if it is unset or empty."""
    value = os.environ.get(name)
    if not value:
        raise ImproperlyConfigured(f"Required environment variable {name!r} is not set.")
    return value


def get_str(name: str, default: str) -> str:
    """Return the value of ``name``, or ``default`` when it is unset or empty."""
    value = os.environ.get(name)
    if not value:
        return default
    return value


def get_bool(name: str, default: bool) -> bool:
    """Return ``name`` parsed as a boolean, or ``default`` when unset or empty.

    Accepts ``true``/``false``, ``1``/``0``, ``yes``/``no`` and ``on``/``off``
    case-insensitively. Any other non-empty value is a configuration error.
    """
    value = os.environ.get(name)
    if not value:
        return default
    normalized = value.strip().lower()
    if normalized in _TRUE_VALUES:
        return True
    if normalized in _FALSE_VALUES:
        return False
    raise ImproperlyConfigured(f"Environment variable {name!r} must be a boolean, got {value!r}.")


def get_list(name: str, default: list[str]) -> list[str]:
    """Return ``name`` as a comma-separated list, or ``default`` when unset/empty.

    Items are stripped of surrounding whitespace and empty items are dropped.
    """
    value = os.environ.get(name)
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


def require_list(name: str) -> list[str]:
    """Return ``name`` as a non-empty comma-separated list; raise otherwise."""
    items = [item.strip() for item in require_str(name).split(",") if item.strip()]
    if not items:
        raise ImproperlyConfigured(
            f"Required environment variable {name!r} must contain at least one value."
        )
    return items
