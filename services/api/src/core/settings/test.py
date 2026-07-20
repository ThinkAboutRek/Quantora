"""Test settings: deterministic, fast, and free of real secrets."""

from core.settings.base import *  # noqa: F403
from core.settings.base import SESSION_COOKIE_SAMESITE, enforce_samesite_secure_invariant

DEBUG = False

# A fixed, obviously-fake key: the test suite must never depend on a real one.
SECRET_KEY = "django-insecure-test-key-not-for-any-real-environment"
ALLOWED_HOSTS = ["testserver"]

# MD5 is intentionally weak but fast; acceptable only because these settings are
# exclusive to the automated test suite.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# The suite runs over plain HTTP on SQLite, so the Secure cookie flags are off.
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
enforce_samesite_secure_invariant(
    SESSION_COOKIE_SAMESITE,
    session_secure=SESSION_COOKIE_SECURE,
    csrf_secure=CSRF_COOKIE_SECURE,
)

# Deterministic, self-contained origin allow lists so the CSRF-origin and CORS
# tests do not depend on the ambient environment. The Vite origin is both a
# trusted CSRF origin and the single allowed CORS origin.
CSRF_TRUSTED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
CORS_ALLOWED_ORIGINS = ["http://localhost:5173"]
