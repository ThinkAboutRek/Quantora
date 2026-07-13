"""Admin registration for the email-based :class:`~accounts.models.User`.

Extends Django's stock :class:`~django.contrib.auth.admin.UserAdmin` but removes
every reference to ``username`` so the change/add forms and list view are keyed
on email.
"""

from typing import TYPE_CHECKING

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils.translation import gettext_lazy as _

from accounts.models import User

# ``ModelAdmin`` is generic to type checkers but is not subscriptable at
# runtime, so the parametrised base class is only referenced under
# ``TYPE_CHECKING``; at runtime the plain class is used.
if TYPE_CHECKING:
    _BaseUserAdmin = DjangoUserAdmin[User]
else:
    _BaseUserAdmin = DjangoUserAdmin


@admin.register(User)
class UserAdmin(_BaseUserAdmin):
    """Email-keyed admin for :class:`~accounts.models.User`."""

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (_("Personal info"), {"fields": ("first_name", "last_name")}),
        (
            _("Permissions"),
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        (_("Important dates"), {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "password1", "password2"),
            },
        ),
    )
    ordering = ("email",)
    search_fields = ("email", "first_name", "last_name")
    list_display = ("email", "first_name", "last_name", "is_staff")
