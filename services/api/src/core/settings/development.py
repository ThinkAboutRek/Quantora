"""Development settings.

Local, debug-friendly configuration. It imports safely without any production
secrets, which is why it is also the default ``DJANGO_SETTINGS_MODULE`` for
``manage.py`` and for django-stubs static analysis.
"""

import os

from core import env
from core.settings.base import *  # noqa: F403
from core.settings.base import (
    CSRF_TRUSTED_ORIGINS,
    REST_FRAMEWORK,
    SESSION_COOKIE_SAMESITE,
    enforce_samesite_secure_invariant,
)

DEBUG = True

# --- Cookies ----------------------------------------------------------------
# Local development is plain HTTP, so the transport-security cookie flags are
# off. The SameSite invariant is re-checked against these final values.
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
enforce_samesite_secure_invariant(
    SESSION_COOKIE_SAMESITE,
    session_secure=SESSION_COOKIE_SECURE,
    csrf_secure=CSRF_COOKIE_SECURE,
)

# --- CSRF & CORS ------------------------------------------------------------
# The Vite dev server's origins are trusted for CSRF here (not via ``.env``):
# they are fixed, non-secret, development-only values. ``CORS_ALLOWED_ORIGINS``
# stays empty because local requests reach the API through the Vite proxy and
# are therefore same-origin.
CSRF_TRUSTED_ORIGINS = [
    *CSRF_TRUSTED_ORIGINS,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

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
