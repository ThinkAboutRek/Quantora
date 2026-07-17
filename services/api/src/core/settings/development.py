"""Development settings.

Local, debug-friendly configuration. It imports safely without any production
secrets, which is why it is also the default ``DJANGO_SETTINGS_MODULE`` for
``manage.py`` and for django-stubs static analysis.
"""

import os

from core import env
from core.settings.base import *  # noqa: F403
from core.settings.base import REST_FRAMEWORK

DEBUG = True

# --- Database ---------------------------------------------------------------
# Local development runs against PostgreSQL — the Docker Compose ``postgres``
# service (see ``docs/operations/local-development.md``). The connection is
# assembled entirely from required environment variables read through
# ``core.env``; there are deliberately no connection defaults in this module
# (those live in the root ``.env.example``) and no silent fall-back to SQLite.
# ``POSTGRES_PORT`` is read as a string because Django's PostgreSQL backend
# accepts a string port, so ``require_str`` suffices and ``env.py`` needs no new
# required-int primitive.
#
# ``env.require_str`` raises at import time when a variable is unset, but this
# module is also the ``DJANGO_SETTINGS_MODULE`` that django-stubs imports for
# static type-checking (``uv run --frozen mypy`` and CI), where no database is
# configured. So the required reads run only when a database is actually
# configured (``POSTGRES_DB`` present) — which is every real run, Docker or
# host, where all five variables are supplied and all five are required.
# Otherwise the module installs Django's ``dummy`` backend: it imports cleanly
# for tooling yet raises loudly on the first query, so a genuinely misconfigured
# runtime still fails fast and never silently falls back to SQLite.
if os.environ.get("POSTGRES_DB"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env.require_str("POSTGRES_DB"),
            "USER": env.require_str("POSTGRES_USER"),
            "PASSWORD": env.require_str("POSTGRES_PASSWORD"),
            "HOST": env.require_str("POSTGRES_HOST"),
            "PORT": env.require_str("POSTGRES_PORT"),
        },
    }
else:  # import-only path: static analysis / tooling with no database configured
    DATABASES = {"default": {"ENGINE": "django.db.backends.dummy"}}

# The browsable API is a local convenience only; it must never be a production
# renderer, so it is appended here rather than in ``base``.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_RENDERER_CLASSES": [
        *REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"],
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
}
