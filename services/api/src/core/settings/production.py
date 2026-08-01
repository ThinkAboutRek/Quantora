"""Production settings: hardened, environment-driven, container-ready.

The secret key, allowed hosts, and the full PostgreSQL connection are required
from the environment so a misconfigured deploy fails immediately at startup —
there are no baked defaults for any of them. Static files are collected at
image build time into ``STATIC_ROOT`` and served by WhiteNoise with hashed
manifest names, so the runtime needs no separate static file server.

Deliberately deferred to later phases: HSTS tuning, Redis, Celery, and
observability wiring.
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
# hardening (HSTS tuning).
#
# The redirect default is True and real deployments must keep it. The ONLY
# intended override is docker-compose.production-check.yml: that local smoke
# topology has no TLS terminator, so every plain-HTTP probe would otherwise be
# answered with a 301 instead of exercising the real endpoint.
SECURE_SSL_REDIRECT = env.get_bool("DJANGO_SECURE_SSL_REDIRECT", True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Azure Container Apps HTTP ingress terminates TLS at the environment edge and
# forwards plain HTTP to the container, setting ``X-Forwarded-Proto`` itself and
# OVERWRITING any value a client supplies. That overwrite guarantee is exactly
# the precondition Django's documentation requires before this header may be
# trusted, and it is why the header is safe here.
#
# It is a literal, never environment-driven: making the header name configurable
# would let a future misconfiguration trust an arbitrary, caller-controlled
# header. Without this setting Django would treat every forwarded request as
# insecure and answer it with a 301 back through the same edge — an infinite
# redirect loop that every probe reports as healthy, because Container Apps
# treats a 301 as probe success.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

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


# The six libpq TLS modes, exactly as libpq spells them. Anything else is a
# configuration error, not a value to coerce.
_SSLMODES = ("disable", "allow", "prefer", "require", "verify-ca", "verify-full")
# The two modes under which libpq validates the server certificate chain and
# therefore needs a certificate authority bundle.
_VERIFYING_SSLMODES = ("verify-ca", "verify-full")


def _read_ssl_options() -> dict[str, str]:
    """Read the libpq TLS options ``POSTGRES_SSLMODE`` and ``POSTGRES_SSLROOTCERT``.

    ``POSTGRES_SSLMODE`` is required and has deliberately **no** default, the
    same way ``DJANGO_ALLOWED_HOSTS`` fails loudly rather than guessing: a
    default would be a value that could silently reach a real deployment if the
    variable were ever dropped.

    ``POSTGRES_SSLROOTCERT`` is passed through only for the two verifying modes,
    where it is then required. Without it libpq falls back to
    ``~/.postgresql/root.crt``, which does not exist for the non-root UID 10001
    runtime user, and the resulting failure reads like a missing certificate
    authority rather than a missing path.
    """
    sslmode = env.require_str("POSTGRES_SSLMODE")
    if sslmode not in _SSLMODES:
        raise ImproperlyConfigured(
            f"Environment variable 'POSTGRES_SSLMODE' must be one of {_SSLMODES}, got {sslmode!r}."
        )

    options = {"sslmode": sslmode}
    if sslmode in _VERIFYING_SSLMODES:
        sslrootcert = os.environ.get("POSTGRES_SSLROOTCERT")
        if not sslrootcert:
            raise ImproperlyConfigured(
                "Environment variable 'POSTGRES_SSLROOTCERT' is required when "
                f"'POSTGRES_SSLMODE' is {sslmode!r}: libpq would otherwise fall back to "
                "'~/.postgresql/root.crt', which does not exist for the non-root runtime "
                "user, and report a missing certificate authority instead of a missing path."
            )
        options["sslrootcert"] = sslrootcert
    return options


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env.require_str("POSTGRES_DB"),
        "USER": env.require_str("POSTGRES_USER"),
        "PASSWORD": env.require_str("POSTGRES_PASSWORD"),
        "HOST": env.require_str("POSTGRES_HOST"),
        "PORT": env.require_str("POSTGRES_PORT"),
        "OPTIONS": {"connect_timeout": _read_connect_timeout(), **_read_ssl_options()},
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
