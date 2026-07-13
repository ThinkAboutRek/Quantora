"""Development settings.

Local, debug-friendly configuration. It imports safely without any production
secrets, which is why it is also the default ``DJANGO_SETTINGS_MODULE`` for
``manage.py`` and for django-stubs static analysis.
"""

from core.settings.base import *  # noqa: F403
from core.settings.base import REST_FRAMEWORK

DEBUG = True

# The browsable API is a local convenience only; it must never be a production
# renderer, so it is appended here rather than in ``base``.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_RENDERER_CLASSES": [
        *REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"],
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
}
