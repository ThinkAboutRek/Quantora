# Contributing to Quantora

Thank you for helping build Quantora. This guide covers the conventions that
keep the repository consistent, reproducible, and honest about what it does.

Quantora is deliberately narrow: end-of-day, USD, US-listed equities and ETFs,
long-only, transaction-based, with deterministic analytics and no advice or
prediction. Contributions should keep it that way. When in doubt, defer to the
[Product Charter](docs/product/product-charter.md) and the
[Architecture Decision Records](docs/adr/README.md).

---

## Development workflow

Work in small, verifiable units. For each change:

1. **Plan.** Understand the phase or task and its acceptance criteria before
   writing code. Confirm the change fits the locked scope and the ADRs.
2. **Implement one unit.** Make a single, focused change — one feature, fix, or
   refactor at a time. Do not pull work forward from later roadmap phases.
3. **Verify.** Run the relevant formatters, linters, type checks, and tests.
   Add tests for new behaviour.
4. **Review the diff.** Read your own change end to end. Remove debug code and
   anything out of scope.
5. **Commit once, focused.** Group the change into one meaningful commit with a
   descriptive message (see below).

---

## Commit messages

Quantora uses [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<optional scope>): <short imperative summary>
```

Common types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`,
`ci`, `security`, `deploy`, `release`.

Quantora-style examples:

```text
docs: establish Quantora product and architecture foundation
feat(portfolios): deliver first React to Django vertical slice
feat(risk-engine): calculate daily returns and volatility
feat(market-data): add Twelve Data provider adapter
test: complete Quantora release verification suite
security: harden Quantora application boundaries
```

Keep the summary in the imperative mood and under about 72 characters. Explain
the *why* in the body when it is not obvious from the diff.

---

## Package managers

Quantora is a polyglot workspace. Use the designated tool for each ecosystem and
never mix alternatives:

* **Python:** [uv](https://docs.astral.sh/uv/) with a single committed
  `uv.lock`. Each deployable service declares its own runtime dependencies.
  Never introduce `pip`, Poetry, pipenv, or a second-source `requirements.txt`.
* **Node:** [pnpm](https://pnpm.io/) for the React app, with a committed
  `pnpm-lock.yaml` and pinned package-manager and Node versions. Never mix npm,
  Yarn, and pnpm lockfiles.
* **CI installs** use frozen lockfiles (`uv sync --frozen`,
  `pnpm install --frozen-lockfile`) so builds are reproducible.

Pin runtime versions in Docker and CI. Lockfiles are committed.

---

## Charting

**Apache ECharts (the official `echarts` package) is the only general-purpose
charting library.** Do not add Recharts, Chart.js, react-chartjs-2, Highcharts,
Victory, Nivo, or any other general-purpose charting library. A narrowly focused
specialist visualisation dependency may only be added later through an accepted
ADR that demonstrates a requirement Apache ECharts cannot reasonably satisfy.

Charts are presentation components only. Authoritative values must come from
Django and the risk-engine service, never from client-side chart transforms.

---

## Testing philosophy

* Favour a healthy test pyramid: fast unit tests over financial calculations,
  focused integration tests, and a small number of end-to-end checks for the
  primary workflow.
* Financial calculations must be deterministic and covered by small,
  hand-checked fixtures.
* **Hard rule: automated tests never call live market-data providers.** Tests
  use the deterministic `FixtureProvider`, mocked transports, and normalized
  response fixtures. CI must stay green even when every external provider is
  unavailable. Live-provider checks are separate, manual, and excluded from CI.
* Prefer explicit "unavailable" results over estimates from insufficient data.
* Keep financial language neutral. Automated content tests guard against
  advisory or predictive wording.

---

## Documentation

Update the relevant documentation in the same change that alters behaviour. Keep
internal links valid — link only to documents that exist. Do not commit secrets,
provider response data, or licensed market data (see the
[Security policy](SECURITY.md) and ADR 001).
