"""Test settings: deterministic, fast, and free of real secrets."""

from core.settings.base import *  # noqa: F403

DEBUG = False

# A fixed, obviously-fake key: the test suite must never depend on a real one.
SECRET_KEY = "django-insecure-test-key-not-for-any-real-environment"
ALLOWED_HOSTS = ["testserver"]

# MD5 is intentionally weak but fast; acceptable only because these settings are
# exclusive to the automated test suite.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
