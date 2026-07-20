"""Base Django settings shared by every Quantora environment.

The environment-specific modules (:mod:`~core.settings.development`,
:mod:`~core.settings.test`, :mod:`~core.settings.production`) import everything
from here and override only what differs. Values that vary by environment or
that hold secrets are read through :mod:`core.env` so misconfiguration fails
fast rather than silently defaulting.
"""

from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

from core import env

# ``BASE_DIR`` is the ``services/api`` directory — the location of ``manage.py``.
# This file lives at ``services/api/src/core/settings/base.py``.
BASE_DIR = Path(__file__).resolve().parents[3]

# --- Core security ----------------------------------------------------------
SECRET_KEY = env.get_str(
    "DJANGO_SECRET_KEY",
    "django-insecure-development-only-key-change-me",
)
DEBUG = env.get_bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS = env.get_list("DJANGO_ALLOWED_HOSTS", ["localhost", "127.0.0.1"])

# --- Applications -----------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "accounts",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # CorsMiddleware must sit as high as possible and, in particular, ahead of
    # CommonMiddleware so CORS headers survive any early response.
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "quantora.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "quantora.wsgi.application"
ASGI_APPLICATION = "quantora.asgi.application"

# --- Database ---------------------------------------------------------------
# Local SQLite only. The deployable PostgreSQL configuration is a Phase 5
# concern; there is deliberately no DATABASE_URL handling here.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    },
}

# --- Authentication ---------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --- Internationalization ---------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# --- Static files -----------------------------------------------------------
STATIC_URL = "static/"

# --- Defaults ---------------------------------------------------------------
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Django REST Framework --------------------------------------------------
# Session authentication is the only accepted credential, and the default
# posture is authenticated: every endpoint requires a logged-in user unless it
# explicitly opts out (e.g. the health probe and the auth bootstrap views).
# Throttle *rates* are declared here, but no throttle class is applied globally
# — only the register and login views opt in, via ``ScopedRateThrottle``.
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "core.api.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "auth_register": "5/hour",
        "auth_login": "10/minute",
    },
}

# --- Sessions, CSRF & CORS --------------------------------------------------
# The frontend is a browser SPA that authenticates with the session cookie and
# submits the CSRF token from the readable ``csrftoken`` cookie in a request
# header. The session cookie is therefore HttpOnly (never exposed to JS) while
# the CSRF cookie is deliberately readable.
CSRF_USE_SESSIONS = False
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False
CSRF_FAILURE_VIEW = "core.api.errors.csrf_failure"

# ``SameSite`` is shared by both cookies and validated from the environment.
# ``None`` permits credentialed cross-site use but is meaningless (and rejected
# by browsers) without the Secure attribute, so it is only allowed when both
# cookies are already Secure. The Secure flags are set per environment, so this
# invariant is (re)checked there via ``enforce_samesite_secure_invariant``.
_COOKIE_SAMESITE = env.get_samesite("DJANGO_COOKIE_SAMESITE", "Lax")
SESSION_COOKIE_SAMESITE = _COOKIE_SAMESITE
CSRF_COOKIE_SAMESITE = _COOKIE_SAMESITE


def enforce_samesite_secure_invariant(
    samesite: str, *, session_secure: bool, csrf_secure: bool
) -> None:
    """Reject ``SameSite=None`` cookies that are not also ``Secure``.

    Called from each environment module after it has set its Secure flags, so
    the check sees the final, per-environment values.
    """
    if samesite == "None" and not (session_secure and csrf_secure):
        raise ImproperlyConfigured(
            "DJANGO_COOKIE_SAMESITE='None' requires SESSION_COOKIE_SECURE and "
            "CSRF_COOKIE_SECURE to be True; refusing to emit credentialed "
            "cross-site cookies without the Secure attribute."
        )


# Exact origins trusted for CSRF-protected unsafe requests. Empty by default;
# environment modules add the values appropriate to their deployment.
CSRF_TRUSTED_ORIGINS = env.get_origin_list("DJANGO_CSRF_TRUSTED_ORIGINS", [])

# Credentialed CORS, restricted to the API surface and to an explicit allow
# list. Wildcard origins are never combined with credentials, and there is no
# origin-regex allow list — only exact, validated origins.
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = env.get_origin_list("DJANGO_CORS_ALLOWED_ORIGINS", [])
CORS_URLS_REGEX = r"^/api/.*$"
