"""Production settings: hardened, environment-driven, container-ready.

The secret key, allowed hosts, and the full PostgreSQL connection are required
from the environment so a misconfigured deploy fails immediately at startup —
there are no baked defaults for any of them. Static files are collected at
image build time into ``STATIC_ROOT`` and served by WhiteNoise with hashed
manifest names, so the runtime needs no separate static file server.

Deliberately deferred to later phases: HSTS tuning, ``SECURE_PROXY_SSL_HEADER``
handling, Redis, Celery, and observability wiring.
"""

import os

from django.core.exceptions import ImproperlyConfigured

from core import env
from core.settings.base import *  # noqa: F403
from core.settings.base import (
    MIDDLEWARE,
    SESSION_COOKIE_SAMESITE,
    enforce_samesite_secure_invariant,
)

DEBUG = False

SECRET_KEY = env.require_str("DJANGO_SECRET_KEY")
ALLOWED_HOSTS = env.require_list("DJANGO_ALLOWED_HOSTS")

# Transport-security foundations. A later phase layers on the remaining
# hardening (HSTS tuning, proxy SSL header handling, etc.).
#
# The redirect default is True and real deployments must keep it. The ONLY
# intended override is docker-compose.production-check.yml: that local smoke
# topology has no TLS terminator, so every plain-HTTP probe would otherwise be
# answered with a 301 instead of exercising the real endpoint.
SECURE_SSL_REDIRECT = env.get_bool("DJANGO_SECURE_SSL_REDIRECT", True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# With Secure cookies mandatory in production, ``SameSite=None`` (for a
# cross-site frontend) is permissible; the invariant confirms the pairing.
# Trusted CSRF origins, allowed CORS origins, and the SameSite policy all come
# from the environment here — no domains are hard-coded in this module.
enforce_samesite_secure_invariant(
    SESSION_COOKIE_SAMESITE,
    session_secure=SESSION_COOKIE_SECURE,
    csrf_secure=CSRF_COOKIE_SECURE,
)


# --- Database ---------------------------------------------------------------
# The same five connection variables development.py reads, but unconditionally
# required: production has no import-only tooling path, so a missing value must
# fail at startup, never fall back.
def _read_connect_timeout() -> int:
    """Read ``POSTGRES_CONNECT_TIMEOUT`` as a bounded positive integer.

    Defaults to 3 seconds when unset or empty. Values below 2 are rejected:
    PostgreSQL's libpq documentation states a ``connect_timeout`` below 2
    seconds is not recommended, and libpq does not honour smaller values
    usefully. There is deliberately no application-level retry loop.
    """
    raw = os.environ.get("POSTGRES_CONNECT_TIMEOUT")
    if not raw:
        return 3
    try:
        value = int(raw)
    except ValueError:
        raise ImproperlyConfigured(
            f"Environment variable 'POSTGRES_CONNECT_TIMEOUT' must be an integer, got {raw!r}."
        ) from None
    if value < 2:
        raise ImproperlyConfigured(
            "Environment variable 'POSTGRES_CONNECT_TIMEOUT' must be at least 2: "
            "libpq does not usefully honour a connect_timeout below 2 seconds."
        )
    return value


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env.require_str("POSTGRES_DB"),
        "USER": env.require_str("POSTGRES_USER"),
        "PASSWORD": env.require_str("POSTGRES_PASSWORD"),
        "HOST": env.require_str("POSTGRES_HOST"),
        "PORT": env.require_str("POSTGRES_PORT"),
        "OPTIONS": {"connect_timeout": _read_connect_timeout()},
    },
}

# --- Static files -----------------------------------------------------------
# ``STATIC_ROOT`` is a fixed absolute path, NOT derived from ``BASE_DIR``: the
# image-build layout (where collectstatic runs) and the runtime layout differ,
# and both mount the collected files at exactly this path.
STATIC_ROOT = "/app/staticfiles"

# WhiteNoise serves the collected files from the Django process itself.
# Immediately after SecurityMiddleware, per the WhiteNoise documentation.
_middleware = list(MIDDLEWARE)
_middleware.insert(
    _middleware.index("django.middleware.security.SecurityMiddleware") + 1,
    "whitenoise.middleware.WhiteNoiseMiddleware",
)
MIDDLEWARE = _middleware

# Hashed, manifest-backed, pre-compressed static files. The manifest is written
# by collectstatic at image build time; a missing entry is a hard error.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
