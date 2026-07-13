"""Tests for the typed environment-variable readers in :mod:`core.env`."""

import pytest
from django.core.exceptions import ImproperlyConfigured

from core import env


def test_require_str_raises_when_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("QUANTORA_TEST_MISSING", raising=False)

    with pytest.raises(ImproperlyConfigured):
        env.require_str("QUANTORA_TEST_MISSING")


def test_require_list_raises_when_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("QUANTORA_TEST_MISSING_LIST", raising=False)

    with pytest.raises(ImproperlyConfigured):
        env.require_list("QUANTORA_TEST_MISSING_LIST")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("true", True),
        ("TRUE", True),
        ("1", True),
        ("yes", True),
        ("on", True),
        ("false", False),
        ("FALSE", False),
        ("0", False),
        ("no", False),
        ("off", False),
    ],
)
def test_get_bool_parses_known_values(
    monkeypatch: pytest.MonkeyPatch, raw: str, expected: bool
) -> None:
    monkeypatch.setenv("QUANTORA_TEST_BOOL", raw)

    # default is the opposite of expected, so a wrong result cannot pass.
    assert env.get_bool("QUANTORA_TEST_BOOL", default=not expected) is expected


def test_get_bool_returns_default_when_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("QUANTORA_TEST_BOOL_MISSING", raising=False)

    assert env.get_bool("QUANTORA_TEST_BOOL_MISSING", default=True) is True


def test_get_bool_rejects_unknown_value(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("QUANTORA_TEST_BOOL_BAD", "maybe")

    with pytest.raises(ImproperlyConfigured):
        env.get_bool("QUANTORA_TEST_BOOL_BAD", default=False)


def test_get_list_splits_and_trims(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("QUANTORA_TEST_LIST", " a , b ,, c ")

    assert env.get_list("QUANTORA_TEST_LIST", default=[]) == ["a", "b", "c"]


def test_get_list_returns_default_when_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("QUANTORA_TEST_LIST_MISSING", raising=False)

    assert env.get_list("QUANTORA_TEST_LIST_MISSING", default=["fallback"]) == ["fallback"]
