"""Proxy-aware HTTPS and PostgreSQL client TLS under the production settings.

Two deployment-critical contracts live here.

**Proxy-aware HTTPS.** Azure Container Apps ingress terminates TLS at the edge
and forwards plain HTTP to the container, setting ``X-Forwarded-Proto`` itself
and overwriting anything the caller sent. ``SECURE_PROXY_SSL_HEADER`` names that
one header and only that one; without it Django answers every forwarded request
with a 301 back through the same edge — an infinite redirect loop that all three
Container Apps probes report as healthy, because a 301 counts as probe success.

**PostgreSQL client TLS.** ``POSTGRES_SSLMODE`` is required with no default and
``POSTGRES_SSLROOTCERT`` is required whenever the mode verifies the chain.

Production settings are exercised exactly the way ``tests/accounts/test_cors.py``
already does it: supply throwaway values for everything the module requires at
import, reload the module, then read the resulting values. Nothing here needs
PostgreSQL, a network, or an Azure resource.
"""

from __future__ import annotations

from importlib import import_module, reload
from types import ModuleType
from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.test import Client, RequestFactory, override_settings

LIVENESS_URL = "/api/v1/health/"

# A path that exists on the image but not in any trust store — the tests only
# check that the value is passed through, never that it resolves.
CA_BUNDLE = "/etc/ssl/certs/ca-certificates.crt"


def load_production(
    monkeypatch: pytest.MonkeyPatch,
    *,
    sslmode: str | None = "require",
    sslrootcert: str | None = None,
) -> ModuleType:
    """Reload ``core.settings.production`` with throwaway required values.

    ``sslmode``/``sslrootcert`` of ``None`` unset the variable entirely; an
    empty string sets it to an empty value, which the module must treat the same
    way as unset.
    """
    monkeypatch.setenv("DJANGO_SECRET_KEY", "x" * 50)
    monkeypatch.setenv("DJANGO_ALLOWED_HOSTS", "api.quantora.test")
    monkeypatch.setenv("POSTGRES_DB", "throwaway")
    monkeypatch.setenv("POSTGRES_USER", "throwaway")
    monkeypatch.setenv("POSTGRES_PASSWORD", "throwaway")
    monkeypatch.setenv("POSTGRES_HOST", "localhost")
    monkeypatch.setenv("POSTGRES_PORT", "5432")

    for name, value in (("POSTGRES_SSLMODE", sslmode), ("POSTGRES_SSLROOTCERT", sslrootcert)):
        if value is None:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, value)

    return reload(import_module("core.settings.production"))


def database_options(production: ModuleType) -> dict[str, Any]:
    """Return the production ``OPTIONS`` mapping for the default connection."""
    options: dict[str, Any] = production.DATABASES["default"]["OPTIONS"]
    return options


# --- Proxy-aware HTTPS ------------------------------------------------------


def test_forwarded_proto_https_is_treated_as_secure(monkeypatch: pytest.MonkeyPatch) -> None:
    production = load_production(monkeypatch)

    with override_settings(SECURE_PROXY_SSL_HEADER=production.SECURE_PROXY_SSL_HEADER):
        request = RequestFactory().get(LIVENESS_URL, HTTP_X_FORWARDED_PROTO="https")

        assert request.is_secure() is True


def test_request_without_the_forwarded_header_is_not_secure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    production = load_production(monkeypatch)

    with override_settings(SECURE_PROXY_SSL_HEADER=production.SECURE_PROXY_SSL_HEADER):
        request = RequestFactory().get(LIVENESS_URL)

        assert request.is_secure() is False


@pytest.mark.parametrize(
    ("header", "value"),
    [
        ("X-Forwarded-Protocol", "https"),
        ("X-Forwarded-Ssl", "on"),
        ("Front-End-Https", "on"),
    ],
)
def test_other_forwarding_headers_are_not_trusted(
    monkeypatch: pytest.MonkeyPatch, header: str, value: str
) -> None:
    # Only the one configured header may be honoured; a proxy header Django was
    # never told to trust must not be able to promote a request to secure.
    production = load_production(monkeypatch)

    with override_settings(SECURE_PROXY_SSL_HEADER=production.SECURE_PROXY_SSL_HEADER):
        request = RequestFactory().get(LIVENESS_URL, headers={header: value})

        assert request.is_secure() is False


def test_forwarded_https_liveness_probe_is_not_redirected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The redirect-loop regression test: with the redirect ON and the forwarded
    # header trusted, the liveness path must answer 200, never 301.
    production = load_production(monkeypatch)

    with override_settings(
        SECURE_SSL_REDIRECT=production.SECURE_SSL_REDIRECT,
        SECURE_PROXY_SSL_HEADER=production.SECURE_PROXY_SSL_HEADER,
    ):
        # Built inside the override so its handler loads SecurityMiddleware with
        # these settings — the middleware reads the redirect flag at __init__.
        response = Client().get(LIVENESS_URL, HTTP_X_FORWARDED_PROTO="https")

    assert response.status_code == 200


def test_liveness_probe_without_the_forwarded_header_does_redirect(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The control for the test above: without the header the same client really
    # does 301, which proves the 200 there comes from the trusted header and not
    # from an inactive redirect setting.
    production = load_production(monkeypatch)

    with override_settings(
        SECURE_SSL_REDIRECT=production.SECURE_SSL_REDIRECT,
        SECURE_PROXY_SSL_HEADER=production.SECURE_PROXY_SSL_HEADER,
    ):
        response = Client().get(LIVENESS_URL)

    assert response.status_code == 301


def test_secure_cookie_flags_remain_on(monkeypatch: pytest.MonkeyPatch) -> None:
    production = load_production(monkeypatch)

    assert production.SESSION_COOKIE_SECURE is True
    assert production.CSRF_COOKIE_SECURE is True


def test_ssl_redirect_remains_on_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DJANGO_SECURE_SSL_REDIRECT", raising=False)
    production = load_production(monkeypatch)

    assert production.SECURE_SSL_REDIRECT is True
    assert production.SECURE_PROXY_SSL_HEADER == ("HTTP_X_FORWARDED_PROTO", "https")


# --- PostgreSQL client TLS --------------------------------------------------


@pytest.mark.parametrize("sslmode", ["disable", "allow", "prefer", "require"])
def test_non_verifying_sslmode_is_passed_through(
    monkeypatch: pytest.MonkeyPatch, sslmode: str
) -> None:
    production = load_production(monkeypatch, sslmode=sslmode)
    options = database_options(production)

    assert options["sslmode"] == sslmode
    assert options["connect_timeout"] == 3


def test_unknown_sslmode_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(ImproperlyConfigured, match="POSTGRES_SSLMODE"):
        load_production(monkeypatch, sslmode="verify-everything")


@pytest.mark.parametrize("sslmode", [None, ""])
def test_missing_or_empty_sslmode_is_rejected(
    monkeypatch: pytest.MonkeyPatch, sslmode: str | None
) -> None:
    # There is deliberately no default: a dropped variable must fail loudly
    # rather than silently reach a real deployment with a weaker mode.
    with pytest.raises(ImproperlyConfigured, match="POSTGRES_SSLMODE"):
        load_production(monkeypatch, sslmode=sslmode)


@pytest.mark.parametrize("sslmode", ["verify-ca", "verify-full"])
@pytest.mark.parametrize("sslrootcert", [None, ""])
def test_verifying_sslmode_without_a_root_certificate_is_rejected(
    monkeypatch: pytest.MonkeyPatch, sslmode: str, sslrootcert: str | None
) -> None:
    # Load bearing: libpq would otherwise fall back to ~/.postgresql/root.crt,
    # which does not exist for the non-root runtime user.
    with pytest.raises(ImproperlyConfigured, match="POSTGRES_SSLROOTCERT"):
        load_production(monkeypatch, sslmode=sslmode, sslrootcert=sslrootcert)


@pytest.mark.parametrize("sslmode", ["verify-ca", "verify-full"])
def test_verifying_sslmode_passes_through_both_values(
    monkeypatch: pytest.MonkeyPatch, sslmode: str
) -> None:
    production = load_production(monkeypatch, sslmode=sslmode, sslrootcert=CA_BUNDLE)
    options = database_options(production)

    assert options["sslmode"] == sslmode
    assert options["sslrootcert"] == CA_BUNDLE
    assert options["connect_timeout"] == 3


def test_non_verifying_sslmode_ignores_a_set_root_certificate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # `disable` never validates a chain, so the certificate path must not be
    # forwarded to libpq even when the variable is set.
    production = load_production(monkeypatch, sslmode="disable", sslrootcert=CA_BUNDLE)
    options = database_options(production)

    assert options["sslmode"] == "disable"
    assert "sslrootcert" not in options
    assert options["connect_timeout"] == 3


def test_connect_timeout_override_still_applies_alongside_tls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The TLS options are additive: they must not displace or alter the existing
    # connect_timeout behaviour.
    monkeypatch.setenv("POSTGRES_CONNECT_TIMEOUT", "5")
    production = load_production(monkeypatch, sslmode="verify-full", sslrootcert=CA_BUNDLE)
    options = database_options(production)

    assert options["connect_timeout"] == 5
    assert options["sslmode"] == "verify-full"
    assert options["sslrootcert"] == CA_BUNDLE
