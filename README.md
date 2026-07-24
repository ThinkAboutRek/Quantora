# Quantora

**End-of-Day Portfolio Risk Intelligence**

Quantora is a cloud-native portfolio analytics platform that turns a transaction
history and end-of-day market data into clear, explainable portfolio valuations,
performance views, risk metrics, a benchmark comparison, and a simple
price-shock scenario.

Quantora exists to give an individual investor **educational visibility** into a
small, long-only portfolio of US-listed equities and ETFs. Many basic trackers
show current holdings and profit or loss but explain little about concentration,
historical volatility, drawdowns, benchmark-relative performance, or how fresh
the underlying data is. Professional risk platforms answer these questions but
are often too complex or expensive for an educational project. Quantora aims to
be a credible product that answers questions like *"which holdings dominate my
portfolio?"*, *"how volatile has it been?"*, and *"what was its largest
historical decline?"* — **without predicting markets or telling anyone what to
buy or sell.**

> **Status: under development.** Quantora is being built in phases. This
> repository currently contains the product and architecture documentation
> baseline; application code is added in later phases.

---

## What Quantora does (V1 scope)

* **Markets:** US-listed common equities and ETFs only.
* **Currency:** USD-denominated portfolios only.
* **Positions:** long-only (no shorts, margin, or leverage).
* **Data:** end-of-day only, using historical adjusted closing prices.
* **Holdings:** derived from a transaction ledger (buys and sells); weighted
  average cost is used for estimated unrealised profit or loss.
* **Locked V1 metric set:**
  * Portfolio value
  * Asset allocation
  * Estimated unrealised profit or loss
  * Daily portfolio returns
  * Annualised volatility (252 trading days, minimum 30 observations)
  * Maximum drawdown
  * Concentration (largest holding, top-three, HHI)
* **One benchmark-comparison workflow** with environment-appropriate real or
  synthetic benchmark data (actual SPY only in provider-enabled private
  development where terms permit; deterministic fixtures in automated tests; a
  clearly labelled fictional broad-market benchmark in the public synthetic
  demo — never presented as SPY).
* **One static price-shock scenario** workflow (instantaneous, hypothetical).
* **Deterministic, neutral explanations** — no generative AI advice.

See the [Product Charter](docs/product/product-charter.md) for the full,
authoritative V1 definition.

---

## What Quantora is not (non-goals)

Quantora does **not**, and will not in V1/V1.5:

* Execute trades, automate trading, or provide trading signals.
* Predict prices or provide expected-price targets.
* Provide buy/hold/sell or personalised investment recommendations.
* Assess whether an investment is suitable for a user.
* Provide portfolio optimisation that tells users what to purchase.
* Offer real-time or streaming data, or intraday charts.
* Support options, futures, leveraged products, short positions, or margin.
* Integrate with brokers or expose public API keys / third-party developer
  access.
* Generate financial advice with an LLM.

---

## Architecture at a glance

Django is the only public application API. React never calls a FastAPI service
directly. The two FastAPI services are private, stateless, and sit behind the
Celery worker. PostgreSQL is the durable source of truth; Redis holds only
temporary coordination, caching, locks, quotas, and the Celery broker.

```text
Browser
   |
   v
React application  (Azure Static Web Apps)
   |
   v
Django REST Framework API  (the only public API)
   |
   +----------------------+
   |                      |
   v                      v
PostgreSQL              Redis
                          |
                          v
                    Celery worker
                     |          |
                     v          v
             Market-data      Risk-engine
             FastAPI          FastAPI
             (private)        (private)
```

* **Market-data service** owns provider integration and normalization behind an
  anti-corruption layer.
* **Risk-engine service** owns deterministic, versioned financial calculations.
* **Celery worker** orchestrates the services and persists results through
  Django domain code.

The reasoning behind these boundaries is recorded in the
[Architecture Decision Records](docs/adr/README.md).

---

## Technology stack

Consistent with the locked stack:

* **Frontend:** React, TypeScript, Vite, [Apache ECharts][echarts] (the only
  general-purpose charting library), pnpm.
* **Backend:** Django, Django REST Framework, FastAPI, Pydantic, Celery,
  PostgreSQL, Redis, pytest; managed with uv.
* **Local orchestration:** Docker Compose.
* **Cloud (Azure):** Container Apps (Django, FastAPI services, worker, Beat),
  Static Web Apps (React), Database for PostgreSQL, Managed Redis, Key Vault,
  Application Insights.
* **Infrastructure & CI/CD:** Bicep, GitHub Actions with OIDC (federated
  credentials — no long-lived Azure secrets).

[echarts]: https://echarts.apache.org/

---

## Toolchains and local commands

Quantora is a polyglot workspace with pinned toolchains so every contributor
and CI runner resolves the same versions.

| Toolchain | Pinned version | Pin file |
| --------- | -------------- | -------- |
| Python    | 3.13           | `.python-version` |
| uv        | `>=0.11.28,<0.12` | `[tool.uv] required-version` in `pyproject.toml` |
| Node      | 24             | `.node-version` |
| pnpm      | 11.11.0        | `packageManager` in `apps/web/package.json` |

The Python side is a uv workspace rooted at the repository (a virtual,
non-packaged root). `packages/contracts` is the one buildable package; the three
`services/*` projects are non-packaged application members. The frontend lives
in `apps/web` and is managed with pnpm.

### First-time setup

Use [Corepack][corepack] (bundled with Node 24) to provision the exact pnpm
version — no global pnpm install required:

```bash
corepack enable
corepack prepare pnpm@11.11.0 --activate   # only if Corepack is unavailable, install pnpm@11.11.0 manually
```

Install [uv][uv] (Astral) if it is not already present, then let it manage the
Python interpreter and virtual environment.

### Command reference

Python (run from the repository root):

```bash
uv lock                                 # resolve/refresh uv.lock
uv sync --all-packages --frozen         # install the workspace from the lockfile
uv run python --version                 # 3.13.x
uv run --frozen ruff check .            # lint
uv run --frozen ruff format --check .   # format check
uv run --frozen mypy packages/contracts/src packages/contracts/tests services/api/src services/api/tests
uv run --frozen pytest packages/contracts/tests services/api/tests
```

Frontend (run from `apps/web`):

```bash
pnpm install --frozen-lockfile   # reproducible/CI install
pnpm dev                         # start the Vite dev server
pnpm build                       # type-check, then production build
pnpm test                        # run the unit tests once
pnpm typecheck                   # tsc -b
pnpm lint                        # eslint .
pnpm format:check                # prettier --check .
```

The frontend reads configuration from `VITE_*` environment variables.
`apps/web/.env.example` documents the one used today, `VITE_API_BASE_URL`
(default `/api/v1`). Vite loads `.env` files from the frontend project root
(`apps/web/`), not the repository root, so a frontend variable placed in the
root `.env` is silently ignored; the root `.env.example` stays backend-only.
Only `VITE_`-prefixed variables are exposed to the browser bundle.

[uv]: https://docs.astral.sh/uv/
[corepack]: https://nodejs.org/api/corepack.html

### Full stack with Docker Compose

For end-to-end local development the API, frontend, PostgreSQL, and Redis run
together under Docker Compose. Only Docker Desktop is required on the host:

```powershell
Copy-Item .env.example .env   # first time only, then set POSTGRES_PASSWORD
docker compose up -d          # build/pull as needed and start all four services
```

The API is then on <http://localhost:8000> and the frontend on
<http://localhost:5173>. See
[Local development with Docker Compose](docs/operations/local-development.md) for
the full workflow — running migrations, inspecting PostgreSQL and Redis, hot
reload, logs and health, data persistence, and resets.

### Production container images

The deployable artifacts — the Django API image (Gunicorn, non-root) and the
React static bundle — are built by the multi-stage Dockerfiles and verified
locally with `docker-compose.production-check.yml`. See
[Production container images](docs/operations/containers.md) for the stage maps,
base-image pins, the API runtime environment contract, and the two-run smoke
strategy. These are image artifacts only; no registry or cloud deployment exists
yet.

### Continuous integration

Continuous integration runs on every pull request and on pushes to `main`, as
two parallel jobs — one for Python and one for the frontend — each installing
from a frozen lockfile (`uv sync --all-packages --frozen` and
`pnpm install --frozen-lockfile`). A failing check blocks the merge.

### Azure infrastructure (Bicep)

The initial Azure environment is defined as subscription-scoped Bicep under
[`infra/bicep/`](infra/bicep/) and verified offline — it provisions nothing by
itself. From the repository root:

```powershell
az bicep build --file infra/bicep/main.bicep --outfile "$env:TEMP\quantora-main.json"
az bicep lint  --file infra/bicep/main.bicep
```

The Django Container App is defined but off by default, and no Azure resource is
created until an operator deploys it. See
[Azure foundation](docs/operations/azure-foundation.md) for the module and
resource map, naming and tags, secure parameters, cost assumptions, and the
operator deployment steps.

---

## Documentation

* [Documentation index](docs/README.md)
* [Product Charter](docs/product/product-charter.md)
* [Architecture Decision Records](docs/adr/README.md)
  * [ADR 001 — Market Data Strategy](docs/adr/0001-market-data-strategy.md)
  * [ADR 002 — Asynchronous Job Strategy](docs/adr/0002-asynchronous-job-strategy.md)
  * [ADR 003 — Service Boundaries](docs/adr/0003-service-boundaries.md)
* [Roadmap](docs/roadmap.md) and [Roadmap corrections](docs/roadmap-corrections.md)
* [Glossary](docs/glossary.md)

Contributor and security information:

* [Contributing guide](CONTRIBUTING.md)
* [Security policy](SECURITY.md)
* [License](LICENSE) — MIT

---

## Disclaimer

> Quantora provides educational portfolio analytics based on historical
> end-of-day data. Results are estimates and may be delayed, incomplete, or
> inaccurate. Quantora does not provide investment advice, recommendations,
> forecasts, brokerage services, tax advice, or suitability assessments. Do not
> rely on Quantora as the sole basis for a financial decision.
