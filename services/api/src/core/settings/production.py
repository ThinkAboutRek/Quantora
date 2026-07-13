"""Production-aware settings FOUNDATION — NOT deployment-ready.

This module establishes the *shape* of a hardened production configuration:
the secret key and allowed hosts are required from the environment (so a
misconfigured deploy fails immediately), and the standard transport-security
cookie/redirect flags are enabled.

It is deliberately incomplete. The deployable database configuration
(PostgreSQL, connection handling, etc.) is a Phase 5 concern and is
intentionally absent here — no database is configured in this module. Do not
deploy against these settings as-is.
"""

from core import env
from core.settings.base import *  # noqa: F403

DEBUG = False

SECRET_KEY = env.require_str("DJANGO_SECRET_KEY")
ALLOWED_HOSTS = env.require_list("DJANGO_ALLOWED_HOSTS")

# Transport-security foundations. A later phase layers on the remaining
# hardening (HSTS tuning, proxy SSL header handling, etc.).
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
