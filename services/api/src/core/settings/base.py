"""Base Django settings shared by every Quantora environment.

The environment-specific modules (:mod:`~core.settings.development`,
:mod:`~core.settings.test`, :mod:`~core.settings.production`) import everything
from here and override only what differs. Values that vary by environment or
that hold secrets are read through :mod:`core.env` so misconfiguration fails
fast rather than silently defaulting.
"""

from pathlib import Path

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
    "accounts",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
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
# The global authentication/permission policy is intentionally minimal here:
# Phase 6 owns real access control, and no CORS is configured in Phase 3.
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
}
