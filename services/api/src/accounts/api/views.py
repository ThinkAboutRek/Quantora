"""Session-authentication endpoints.

Five views implement the browser SPA's auth lifecycle: a CSRF bootstrap, plus
register, login, logout, and a current-user probe. The three unsafe views
(register, login, logout) are explicitly wrapped in ``csrf_protect`` at the
dispatch level so that *anonymous* unsafe requests are CSRF-checked — DRF's
session CSRF only runs once a request is authenticated, which would otherwise
leave anonymous register/login unprotected.
"""

from __future__ import annotations

from typing import ClassVar, cast

from django.contrib.auth import authenticate, login, logout
from django.db import IntegrityError, transaction
from django.middleware.csrf import get_token, rotate_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.api.serializers import (
    CurrentUserSerializer,
    LoginSerializer,
    RegistrationSerializer,
)
from accounts.models import User


class CsrfView(APIView):
    """Issue the ``csrftoken`` cookie and return its masked token.

    Public and unthrottled. It sets the CSRF cookie but creates no session, so
    a SPA can bootstrap a token before the user has authenticated.
    """

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        return Response({"csrf_token": get_token(request._request)})


@method_decorator(csrf_protect, name="dispatch")
class RegisterView(APIView):
    """Register a user, log them in, and return the rotated CSRF token."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope: ClassVar[str] = "auth_register"

    def post(self, request: Request) -> Response:
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                user = serializer.save()
        except IntegrityError as exc:
            # A concurrent request created the same canonical email between our
            # uniqueness check and this insert. Convert the race into the same
            # safe, field-level message the serializer would have returned.
            raise ValidationError({"email": ["A user with this email already exists."]}) from exc
        # Establish the session first; ``login`` rotates the CSRF secret, so the
        # token fetched afterwards matches the post-login cookie.
        login(request._request, user)
        token = get_token(request._request)
        return Response(
            {"user": CurrentUserSerializer(user).data, "csrf_token": token},
            status=status.HTTP_201_CREATED,
        )


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    """Authenticate a user, establish a session, and return a fresh CSRF token."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope: ClassVar[str] = "auth_login"

    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request._request,
            username=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
        )
        if user is None:
            # One identical response for every failure mode — unknown email,
            # wrong password, or inactive account — so none can be told apart.
            return Response(
                {"detail": "Invalid email or password."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        login(request._request, user)
        token = get_token(request._request)
        return Response(
            {"user": CurrentUserSerializer(user).data, "csrf_token": token},
            status=status.HTTP_200_OK,
        )


@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    """Idempotently end the session and invalidate the held CSRF token."""

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        logout(request._request)
        # ``logout`` does not rotate the CSRF secret, so do it explicitly: the
        # token the client held is invalidated whether or not a session existed.
        rotate_token(request._request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """Return the authenticated user's minimal profile.

    Uses the project-default ``IsAuthenticated`` permission, so an anonymous
    request yields ``401`` with a ``WWW-Authenticate`` header.
    """

    def get(self, request: Request) -> Response:
        # IsAuthenticated guarantees a concrete, active user here.
        user = cast(User, request.user)
        return Response(CurrentUserSerializer(user).data)
