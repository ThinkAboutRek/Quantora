"""Smoke test: the contracts package imports cleanly once installed."""

import quantora_contracts


def test_contracts_package_imports() -> None:
    assert quantora_contracts is not None
