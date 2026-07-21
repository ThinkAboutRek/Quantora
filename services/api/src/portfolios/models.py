"""The portfolio model: a named, owner-scoped container of holdings.

Phase 8 introduces only the container itself. A portfolio belongs to exactly one
user, carries a display name that is unique per owner (case-insensitively), and
is fixed to a USD base currency for now. Holdings, transactions, benchmarks, and
archival are deliberately out of scope here.
"""

from django.conf import settings
from django.db import models
from django.db.models import CheckConstraint, Q, UniqueConstraint
from django.db.models.functions import Lower


class Portfolio(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="portfolios",
    )
    name = models.CharField(max_length=120)
    base_currency = models.CharField(max_length=3, default="USD")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            UniqueConstraint(
                "owner",
                Lower("name"),
                name="portfolios_unique_owner_name_ci",
            ),
            CheckConstraint(
                condition=Q(base_currency="USD"),
                name="portfolios_base_currency_usd",
            ),
        ]

    def __str__(self) -> str:
        return self.name
