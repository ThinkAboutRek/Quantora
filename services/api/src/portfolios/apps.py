"""Application configuration for the portfolios app."""

from django.apps import AppConfig


class PortfoliosConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "portfolios"
