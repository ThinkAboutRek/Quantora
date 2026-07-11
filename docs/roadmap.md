# Quantora Final Phase Roadmap

**Planning status:** Locked
**Core duration:** 12 weeks
**Core phases:** 48
**Optional polish duration:** 4 weeks
**Optional phases:** 16
**Target pace:** 4 phases per week

---

# 1. Final Implementation Decisions

## 1.1 Authentication strategy

### Decision

Use **Django's built-in session authentication**, exposed through DRF with `SessionAuthentication`.

Do not use JWT authentication in V1.

### Authentication design

Quantora will use:

* A custom Django user model created before the first migration
* Unique email address as the login identifier
* Django password hashing and validation
* Database-backed Django sessions
* Secure, HttpOnly session cookies
* CSRF protection for every state-changing request
* Exact-origin CORS configuration
* React requests with `credentials: "include"`
* A dedicated CSRF bootstrap endpoint
* DRF `IsAuthenticated` permissions by default
* Explicit object-level ownership checks

Authentication endpoints:

```text
GET  /api/v1/auth/csrf/
POST /api/v1/auth/register/
POST /api/v1/auth/login/
POST /api/v1/auth/logout/
GET  /api/v1/auth/me/
```

The CSRF endpoint will call Django's CSRF token generation and return the masked token in JSON. React will keep that token in memory and send it through the `X-CSRFToken` header.

Django uses sessions as its normal web authentication mechanism, and DRF describes `SessionAuthentication` as suitable for AJAX clients operating in the same session context. DRF also requires valid CSRF tokens for unsafe authenticated requests.

### Production domains

Preferred public configuration:

```text
app.quantora.example
api.quantora.example
```

Production cookie configuration:

* `SESSION_COOKIE_SECURE = True`
* `SESSION_COOKIE_HTTPONLY = True`
* `SESSION_COOKIE_SAMESITE = "Lax"`
* `CSRF_COOKIE_SECURE = True`
* Exact `CSRF_TRUSTED_ORIGINS`
* Exact CORS allowlist
* No wildcard credentialed CORS

During the first Azure deployment, when the frontend and API use unrelated Azure-provided domains:

* Use `SameSite=None`
* Require HTTPS
* Restrict CORS to the exact frontend URL
* Use the CSRF bootstrap endpoint
* Switch to same-site custom subdomains before public launch

### Why session authentication

It is the correct fit because:

* Quantora has one first-party browser client.
* There is no public API in V1.
* There are no mobile clients.
* There are no third-party API consumers.
* Tokens do not need to be stored in browser storage.
* Django owns authentication and authorization.
* Session invalidation and logout remain straightforward.

### Explicitly rejected

* JWT access tokens in `localStorage`
* Long-lived browser bearer tokens
* OAuth 2.0 authorization server functionality
* Social login in V1
* Authentication handled by a FastAPI service
* Azure Static Web Apps authentication as the main product identity system

---

## 1.2 Azure infrastructure-as-code strategy

### Decision

Use **Azure Bicep**.

Repository location:

```text
infra/
└── bicep/
    ├── main.bicep
    ├── environments/
    │   ├── development.bicepparam
    │   └── production.bicepparam
    └── modules/
        ├── container-registry.bicep
        ├── container-apps-environment.bicep
        ├── container-app.bicep
        ├── postgres.bicep
        ├── redis.bicep
        ├── key-vault.bicep
        ├── monitoring.bicep
        ├── static-web-app.bicep
        └── identity-and-access.bicep
```

Bicep is Azure-native, declarative, supports reusable modules and Azure resource types directly, provides `what-if` previews, and does not require a separately managed state file.

### Deployment approach

* Use Bicep modules rather than one large template.
* Use environment parameter files.
* Run `what-if` before deployment.
* Use GitHub Actions with Azure OpenID Connect.
* Do not store long-lived Azure client secrets in GitHub.
* Separate infrastructure deployment from application image deployment.
* Apply database migrations through an explicit deployment job.
* Protect the production GitHub environment with approval rules.

Microsoft documents GitHub Actions authentication through federated OpenID Connect credentials, avoiding a traditional stored Azure password or client secret.

### Why not Terraform

Terraform is a valid professional tool, but Quantora targets Azure only. Bicep provides enough infrastructure depth without adding:

* Remote state storage
* State locking
* Terraform provider version management
* Another cloud abstraction layer

Terraform can be learned in a later project. Bicep is the more focused choice for Quantora.

---

## 1.3 Python and Node package management

### Python decision

Use **uv** with a Python workspace and one committed `uv.lock`.

Proposed workspace:

```text
pyproject.toml
uv.lock

services/
├── api/
│   └── pyproject.toml
├── market-data/
│   └── pyproject.toml
└── risk-engine/
    └── pyproject.toml

packages/
└── contracts/
    └── pyproject.toml
```

The workspace root owns shared development tooling and dependency resolution. Each deployable Python service keeps its own declared runtime dependencies.

Use:

```text
uv sync --frozen
uv run ...
uv add ...
uv lock
```

For production images, install only the relevant workspace package and its dependencies.

uv workspaces support multiple related Python packages with individual `pyproject.toml` files and one shared lockfile. The lockfile records exact resolved versions and is intended to be committed for reproducible installations.

### Node decision

Use **pnpm** for the React application.

Files:

```text
apps/web/package.json
apps/web/pnpm-lock.yaml
```

Rules:

* Commit `pnpm-lock.yaml`.
* Pin the package-manager version.
* Pin the supported Node version.
* Use frozen-lockfile installation in CI.
* Do not create a JavaScript workspace until a second JavaScript package genuinely exists.

pnpm fails CI installation when a committed lockfile is out of date and supports frozen lockfile installation for reproducibility.

### Shared rules

* Never mix `pip`, Poetry, or pipenv into the Python workspace.
* Never commit `requirements.txt` as a second source of truth.
* Never mix npm, Yarn, and pnpm lockfiles.
* Pin runtime versions in Docker and CI.
* Dependabot or Renovate may be added during hardening.
* No tool-specific files, transcripts, or implementation traces belong in the public repository.

---

## 1.4 Charting and Benchmark Data Rules

### Charting library

**Apache ECharts is Quantora's only general-purpose charting library.**

The official `echarts` package is the only general-purpose charting library approved for Quantora. No second general-purpose charting library — including Recharts, Chart.js, react-chartjs-2, Highcharts, Victory, or Nivo — is an approved option.

Apache ECharts will be wrapped in reusable React components and used for:

* Allocation charts
* Cumulative-return charts
* Benchmark-comparison charts
* Drawdown visualisations
* Scenario-impact charts
* Portfolio treemaps
* Future correlation heatmaps

A second general-purpose charting library must not be introduced unless a future accepted Architecture Decision Record documents a requirement that Apache ECharts cannot reasonably satisfy.

Charts must remain presentation components. Financial calculations and authoritative chart-series values must continue to come from Django and the risk-engine service.

### Benchmark data behaviour

Quantora uses one source-independent benchmark-calculation workflow.

The benchmark source depends on the environment:

* Provider-enabled private development may use actual SPY data where the selected provider's terms permit that use.
* Automated tests use deterministic fixture benchmark data.
* The public synthetic demo uses a clearly fictional broad-market benchmark.
* The fictional public-demo benchmark must always be labelled as synthetic.
* The public demo must never describe the fictional benchmark as SPY or claim that it contains actual SPY prices.

The calculation workflow remains identical in every environment. It must apply the same:

* Date alignment
* Return calculation
* Cumulative-return construction
* Comparison logic
* Data-sufficiency rules
* Provenance tracking
* Freshness handling
* Methodology presentation

Benchmark identity, display name, source, synthetic status, and data as-of date must be explicit in the analysis input and result.

---

# 2. Target Repository Structure

```text
quantora/
├── .github/
│   └── workflows/
├── apps/
│   └── web/
├── services/
│   ├── api/
│   ├── market-data/
│   └── risk-engine/
├── packages/
│   └── contracts/
├── infra/
│   └── bicep/
├── docs/
│   ├── adr/
│   ├── architecture/
│   ├── methodology/
│   ├── product/
│   ├── security/
│   ├── testing/
│   └── operations/
├── scripts/
├── docker-compose.yml
├── docker-compose.override.yml
├── pyproject.toml
├── uv.lock
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE
└── .env.example
```

The Celery worker and Celery Beat use the Django service image with different startup commands. They are not separate source-code projects.

---

# 3. Working Method

## Planning and review

Use a planning and review activity for:

* Phase planning
* Architecture review
* Domain modelling
* Acceptance criteria
* Calculation explanations
* Test-case brainstorming
* Documentation review
* Interview-question preparation
* Reviewing whether implementation matches the locked ADRs

## Implementation

Use an implementation activity for:

* Creating and editing files
* Running tests
* Implementing approved plans
* Refactoring
* Inspecting errors
* Running linters and type checkers
* Reviewing diffs
* Preparing focused commits

## Combined workflow

For most implementation phases:

1. Plan and approve the phase.
2. Implement the approved plan.
3. Review the diff manually.
4. Run verification commands.
5. Explain the completed code in your own words.
6. Commit only after acceptance criteria pass.

---

# Week 1: Repository and Engineering Foundation

## Phase 1: Establish the Repository and Documentation Baseline

**Exact goal:** Create a professional repository whose purpose, constraints, architecture, and contribution rules are clear before application code begins.

**What will be built:**

* Git repository
* Root README skeleton
* Product Charter in `docs/product/`
* Three accepted ADRs in `docs/adr/`
* Roadmap document
* `CONTRIBUTING.md`
* `SECURITY.md`
* Licence selection
* `.gitignore`
* `.editorconfig`
* `.env.example`
* Documentation index
* Glossary for financial and architectural terms

**What you will learn:**

* Why architectural decisions should be recorded
* Difference between product requirements and technical decisions
* How repository documentation affects maintainability
* How to define acceptance criteria before implementation

**Main files or areas:**

```text
README.md
CONTRIBUTING.md
SECURITY.md
docs/product/
docs/adr/
docs/roadmap.md
docs/glossary.md
```

**Dependencies:** Locked Product Charter and ADRs.

**Tests or verification:**

* Check every locked decision appears in the repository documents.
* Check no document suggests trading, predictions, or recommendations.
* Check all internal links work.
* Check repository search contains no assistant-specific implementation files.

**Completion criteria:**

* A new reviewer can understand Quantora's purpose, V1 scope, architecture, and non-goals without opening source code.
* The roadmap and ADRs have accepted status.
* Repository conventions are documented.

**Suggested commit:** `docs: establish Quantora product and architecture foundation`

**Execution:** planning and review for document structure and consistency; implementation for creating files and validating links.

---

## Phase 2: Configure the Polyglot Toolchains

**Exact goal:** Establish reproducible Python and Node development environments.

**What will be built:**

* Root uv workspace
* Python workspace members
* Shared contracts package placeholder
* React directory placeholder
* Python version pin
* pnpm and Node version pin
* Root development command documentation
* Ruff, mypy, pytest, ESLint, Prettier and TypeScript configuration foundations

**What you will learn:**

* Python workspace dependency management
* Lockfiles
* Runtime versus development dependencies
* Reproducible environments
* Why each service declares its own dependencies

**Main files or areas:**

```text
pyproject.toml
uv.lock
.python-version
services/*/pyproject.toml
packages/contracts/pyproject.toml
apps/web/package.json
apps/web/pnpm-lock.yaml
```

**Dependencies:** Phase 1.

**Tests or verification:**

* `uv sync --frozen`
* `uv run python --version`
* `pnpm install --frozen-lockfile`
* Confirm clean installation from a fresh clone or temporary directory.
* Confirm only one Python and one Node lockfile strategy exists.

**Completion criteria:**

* All empty Python packages import successfully.
* Frontend dependencies install reproducibly.
* Tool versions are documented.
* Lockfiles are committed.

**Suggested commit:** `build: configure uv and pnpm project toolchains`

**Execution:** planning then implementation. Planning explains workspace tradeoffs; implementation creates and verifies configuration.

---

## Phase 3: Create the Django API Skeleton

**Exact goal:** Create the Django project with production-aware settings and the custom user model before the first migration.

**What will be built:**

* Django project
* DRF configuration
* Environment-based settings
* Custom email-based user model
* Initial database migration
* API version prefix
* Health endpoint
* Structured settings modules
* Basic Django admin registration

**What you will learn:**

* Django project startup
* Why custom user models must be created early
* Django settings separation
* DRF authentication and permissions
* Migration fundamentals

**Main files or areas:**

```text
services/api/src/quantora/
services/api/src/accounts/
services/api/src/core/
services/api/tests/
services/api/pyproject.toml
```

**Dependencies:** Phase 2.

**Tests or verification:**

* Django system check
* Migration check
* Health-endpoint test
* Custom-user creation test
* Settings tests for missing required environment variables
* Ruff and mypy

**Completion criteria:**

* Django starts locally.
* `/api/v1/health/` returns a successful response.
* The custom user model is active.
* No default Django user migration dependency has been accidentally locked in.

**Suggested commit:** `feat(api): initialise Django API and custom user model`

**Execution:** planning then implementation.

---

## Phase 4: Create the React Application and Initial CI

**Exact goal:** Establish the frontend shell and ensure every pull request receives basic automated quality checks.

**What will be built:**

* Vite React TypeScript application
* Router
* Application layout
* Landing-page placeholder
* Error boundary
* Environment-variable validation
* Vitest and React Testing Library
* ESLint and Prettier
* Initial GitHub Actions workflow for Python and frontend checks

**What you will learn:**

* Vite application structure
* TypeScript configuration
* Client-side routing
* Component testing
* Basic continuous integration

**Main files or areas:**

```text
apps/web/src/
apps/web/vite.config.ts
apps/web/tsconfig.json
.github/workflows/ci.yml
```

**Dependencies:** Phases 2 and 3.

**Tests or verification:**

* Frontend build
* Type checking
* Linting
* Landing-page component test
* CI run on a test branch
* Python checks still pass

**Completion criteria:**

* React starts locally.
* Production frontend build succeeds.
* CI runs Python and frontend checks.
* A deliberately failing test causes CI to fail.

**Suggested commit:** `feat(web): initialise React application and CI checks`

**Execution:** planning then implementation.

### Week 1 milestone

**Repository and documentation foundation complete.**

The repository now communicates the project direction and supports reproducible Python and TypeScript development.

---

# Week 2: Docker Compose, Authentication, and First Vertical Slice

## Phase 5: Build the Docker Compose Foundation

**Exact goal:** Run the frontend, Django API, PostgreSQL, and Redis through one local orchestration command.

**What will be built:**

* Development Dockerfiles
* Docker Compose configuration
* PostgreSQL container
* Redis container
* Django API container
* React development container
* Health checks
* Named development volumes
* Environment-template documentation

**What you will learn:**

* Container networking
* Service discovery
* Volumes
* Health checks
* Environment injection
* Difference between development and production containers

**Main files or areas:**

```text
docker-compose.yml
docker-compose.override.yml
services/api/Dockerfile
apps/web/Dockerfile
.env.example
docs/operations/local-development.md
```

**Dependencies:** Phases 3 and 4.

**Tests or verification:**

* Build all images from scratch.
* Start Compose without local Python or Node processes.
* Run migrations inside the API container.
* Confirm Django reaches PostgreSQL.
* Confirm Redis responds.
* Confirm React reaches the Django health endpoint.

**Completion criteria:**

* One documented command starts the local stack.
* Services wait for dependencies appropriately.
* No secrets are embedded in images.
* Data survives an ordinary container restart.

**Suggested commit:** `build: add Docker Compose development environment`

**Execution:** planning then implementation.

---

## Phase 6: Implement Session Authentication in Django

**Exact goal:** Create secure registration, login, logout, CSRF and current-user API endpoints.

**What will be built:**

* Registration serializer and service
* Login endpoint using Django authentication
* Logout endpoint
* Current-user endpoint
* CSRF bootstrap endpoint
* Password validators
* Session settings
* CORS configuration
* Default authenticated DRF permissions
* Authentication throttling baseline

**What you will learn:**

* Session authentication
* Cookies
* CSRF protection
* Credentialed CORS
* Password handling
* Authentication versus authorization

**Main files or areas:**

```text
services/api/src/accounts/
services/api/src/core/settings/
services/api/src/core/api/
services/api/tests/accounts/
```

**Dependencies:** Phase 5.

**Tests or verification:**

* Successful and unsuccessful registration
* Duplicate email rejection
* Password validation
* Successful and unsuccessful login
* Session persistence
* Logout invalidation
* CSRF rejection for unsafe requests
* Unauthenticated access rejection
* CORS allowlist configuration test

**Completion criteria:**

* A registered user receives a valid server-side session.
* Protected endpoints reject anonymous requests.
* State-changing requests fail without CSRF.
* No browser token storage is required.

**Suggested commit:** `feat(auth): implement secure session authentication API`

**Execution:** planning then implementation.

---

## Phase 7: Build the React Authentication Flow

**Exact goal:** Allow users to register, log in, restore their session and log out through React.

**What will be built:**

* Typed API client
* CSRF bootstrap handling
* Credentialed fetch wrapper
* Authentication context or query state
* Register page
* Login page
* Protected routes
* Logout control
* Current-user loading state
* Authentication error handling

**What you will learn:**

* Cross-origin cookie requests
* CSRF headers
* React authentication state
* Route protection
* API error normalization
* Avoiding token storage

**Main files or areas:**

```text
apps/web/src/api/
apps/web/src/auth/
apps/web/src/pages/auth/
apps/web/src/routes/
```

**Dependencies:** Phase 6.

**Tests or verification:**

* Component tests for forms
* API-client tests
* Protected-route tests
* Login session restoration test
* Logout test
* Manual browser inspection of cookies
* Confirm passwords never appear in logs

**Completion criteria:**

* Registration, login and logout work through React.
* Refreshing the page restores authenticated state.
* Anonymous users cannot access protected routes.
* Errors are understandable without exposing server details.

**Suggested commit:** `feat(web): add session-based authentication flow`

**Execution:** planning then implementation.

---

## Phase 8: Create the First Portfolio Vertical Slice

**Exact goal:** Allow an authenticated user to create and list portfolios through React, Django and PostgreSQL.

**What will be built:**

* Minimal `Portfolio` model
* Portfolio serializer
* Create and list endpoints
* Ownership assignment
* React portfolio-list page
* Create-portfolio form
* Empty state
* API integration

Initial fields:

* ID
* Owner
* Name
* Base currency fixed to USD
* Benchmark fixed to SPY
* Created and updated timestamps
* Archived state

**What you will learn:**

* End-to-end request flow
* Django ORM relationships
* DRF serializers and viewsets
* React data fetching
* Database persistence
* User-owned resources

**Main files or areas:**

```text
services/api/src/portfolios/
apps/web/src/features/portfolios/
services/api/tests/portfolios/
```

**Dependencies:** Phases 6 and 7.

**Tests or verification:**

* Portfolio-model tests
* Authenticated create and list tests
* Anonymous rejection
* Ownership assignment test
* React create-form test
* Full local browser workflow

**Completion criteria:**

* A user creates a portfolio in React.
* Django validates and stores it in PostgreSQL.
* The portfolio appears without a manual database change.
* Another user's portfolio does not appear.

**Suggested commit:** `feat(portfolios): deliver first React to Django vertical slice`

**Execution:** planning then implementation.

### Week 2 milestones

* **Docker Compose foundation complete**
* **First React to Django to PostgreSQL vertical slice complete**

---

# Week 3: Portfolio Ownership and Early Azure Deployment

## Phase 9: Complete Portfolio Management and Isolation

**Exact goal:** Finish safe portfolio CRUD operations and prove cross-user isolation.

**What will be built:**

* Portfolio detail endpoint
* Rename operation
* Archive operation
* Delete policy
* Portfolio detail page
* Edit form
* Archive confirmation
* Reusable ownership queryset
* Object permission rules

**What you will learn:**

* Queryset-based authorization
* Object ownership
* Soft archive versus deletion
* API mutation handling
* Confirmation UX

**Main files or areas:**

```text
services/api/src/portfolios/
apps/web/src/features/portfolios/
docs/product/data-retention.md
```

**Dependencies:** Phase 8.

**Tests or verification:**

* User A cannot read, edit or delete User B's portfolio.
* Archived portfolios are excluded by default.
* Invalid IDs do not reveal another user's resource existence.
* Frontend mutation and error tests
* Database constraint tests

**Completion criteria:**

* Multiple portfolios work correctly.
* Every operation is owner-scoped.
* Archive and delete behaviours are documented.
* Isolation tests cover all portfolio endpoints.

**Suggested commit:** `feat(portfolios): complete portfolio lifecycle and isolation`

**Execution:** planning then implementation.

---

## Phase 10: Build Production-Ready Application Images

**Exact goal:** Produce secure, repeatable production images for React and Django.

**What will be built:**

* Multi-stage production Dockerfiles
* Gunicorn configuration
* Non-root container users
* Static-file handling where required
* Production settings
* Liveness and readiness endpoints
* Image labels
* `.dockerignore`
* Container startup scripts

**What you will learn:**

* Multi-stage builds
* Runtime image minimisation
* Non-root execution
* Production web serving
* Liveness versus readiness
* Immutable deployment artefacts

**Main files or areas:**

```text
services/api/Dockerfile
services/api/scripts/
apps/web/Dockerfile
docker/
docs/operations/containers.md
```

**Dependencies:** Phases 5 to 9.

**Tests or verification:**

* Production images build without development volumes.
* Containers run as non-root.
* Django production checks run.
* Readiness fails when PostgreSQL is unavailable.
* Images contain no `.env`, Git history or test secrets.
* Frontend production build serves correctly.

**Completion criteria:**

* The thin vertical slice runs using production images.
* Image configuration is environment-driven.
* Containers can be pushed to a registry unchanged.

**Suggested commit:** `build: add production container images and readiness checks`

**Execution:** planning then implementation.

---

## Phase 11: Create the Initial Bicep Infrastructure

**Exact goal:** Define the smallest Azure environment capable of hosting the current thin slice.

**What will be built:**

* Bicep root deployment
* Container Registry
* Container Apps environment
* Django Container App
* Azure Database for PostgreSQL
* Static Web App resource
* Log Analytics workspace
* Basic Application Insights resource
* Managed identity
* Development parameter file
* `what-if` documentation

Redis, private FastAPI services and workers are added later.

**What you will learn:**

* Bicep syntax
* Azure resource dependencies
* Modules
* Managed identity
* Parameter files
* Environment-specific configuration
* Infrastructure change previews

**Main files or areas:**

```text
infra/bicep/main.bicep
infra/bicep/modules/
infra/bicep/environments/
docs/operations/azure-foundation.md
```

**Dependencies:** Phase 10.

**Tests or verification:**

* Bicep build
* Bicep lint
* Azure `what-if`
* Secret scan
* Naming and tagging review
* Cost review before deployment

**Completion criteria:**

* The template validates.
* `what-if` shows only expected resources.
* No application secret is hard-coded.
* Resource outputs required by deployment are defined.

**Suggested commit:** `infra: define initial Azure thin-slice environment`

**Execution:** planning then implementation. Planning reviews architecture and cost; implementation creates Bicep modules.

---

## Phase 12: Deploy the First Azure Vertical Slice

**Exact goal:** Deploy registration, login and portfolio creation to Azure before adding the financial systems.

**What will be built:**

* Initial Azure resources
* Django image in ACR
* Django Container App deployment
* PostgreSQL migrations
* React deployment to Static Web Apps
* Frontend-to-API CORS configuration
* Cross-origin session and CSRF configuration
* Deployment runbook
* Azure smoke tests

Deployment may initially be manual and repeatable. Full GitHub deployment automation comes later.

**What you will learn:**

* Registry authentication
* Container App revisions
* Azure networking
* Managed service configuration
* Cross-origin session behaviour
* Cloud database migration
* Cloud debugging

**Main files or areas:**

```text
infra/bicep/
scripts/deploy/
services/api/src/core/settings/production.py
apps/web/staticwebapp.config.json
docs/operations/first-deployment.md
```

**Dependencies:** Phases 9 to 11.

**Tests or verification:**

* Public frontend health
* API health and readiness
* Registration
* Login
* Session restoration
* Portfolio creation
* Database persistence after revision restart
* Negative CORS test from an unapproved origin
* Azure log inspection

**Completion criteria:**

* The thin slice works from a browser against Azure.
* Credentials and cookies are secure.
* The deployment can be reproduced from documented commands.
* The project has a working cloud URL.

**Suggested commit:** `deploy: release first Quantora vertical slice to Azure`

**Execution:** planning then implementation.

### Week 3 milestone

**First Azure deployment complete.**

Quantora is already a cloud-hosted full-stack application, although it is not yet a meaningful portfolio-risk product.

---

# Week 4: Transactions and Cost-Basis Domain

## Phase 13: Model Assets and Transactions

**Exact goal:** Establish the domain records needed to derive holdings.

**What will be built:**

* `Asset`
* `ProviderSymbol`
* `Transaction`
* Asset-type restrictions
* Buy and sell transaction types
* Decimal quantity and price fields
* Optional fee and note
* Trade-date rules
* Database indexes and constraints
* Django admin views

**What you will learn:**

* Financial-domain modelling
* Decimal precision
* Database constraints
* Canonical symbols versus provider symbols
* Transaction-ledger design
* Why holdings should be derived

**Main files or areas:**

```text
services/api/src/assets/
services/api/src/transactions/
services/api/tests/assets/
services/api/tests/transactions/
docs/architecture/domain-model.md
```

**Dependencies:** Phase 9.

**Tests or verification:**

* Decimal precision tests
* Positive-quantity constraint
* Non-negative fee constraint
* Supported asset type validation
* USD-only validation
* Buy and sell type validation
* Migration rollback review

**Completion criteria:**

* Assets and transactions can be represented without float arithmetic.
* Unsupported V1 instruments are rejected.
* Database constraints reinforce application validation.

**Suggested commit:** `feat(domain): add asset and transaction models`

**Execution:** planning then implementation.

---

## Phase 14: Implement Transaction Rules and API

**Exact goal:** Support safe manual creation, editing, listing and deletion of buy and sell transactions.

**What will be built:**

* Transaction serializers
* Transaction domain service
* Portfolio-scoped endpoints
* Running-position validation
* Negative-position prevention
* Duplicate-warning logic
* Ordering and pagination
* API error codes
* Ownership enforcement

**What you will learn:**

* Service-layer validation
* Transaction ordering
* Domain invariants
* Nested resource APIs
* Atomic database operations
* API error design

**Main files or areas:**

```text
services/api/src/transactions/api/
services/api/src/transactions/services/
services/api/src/transactions/selectors/
```

**Dependencies:** Phase 13.

**Tests or verification:**

* Buy creation
* Valid partial sell
* Invalid oversell
* Backdated transaction effects
* Edit producing an invalid ledger
* Delete producing an invalid ledger
* Cross-user access attempts
* Atomic rollback tests

**Completion criteria:**

* Every successful mutation leaves a valid non-negative long-only ledger.
* Invalid edits and deletes do not partially update data.
* API errors identify the offending rule safely.

**Suggested commit:** `feat(transactions): implement long-only transaction API`

**Execution:** planning then implementation.

---

## Phase 15: Build Manual Transaction Management in React

**Exact goal:** Let users manage buy and sell transactions without using the Django admin.

**What will be built:**

* Transaction table
* Add-transaction form
* Edit dialog or page
* Delete confirmation
* Asset-symbol input
* Decimal-safe form handling
* Date input
* Loading and empty states
* Domain-error presentation

**What you will learn:**

* Complex form validation
* Decimal values in JavaScript
* Mutation state
* Table UX
* Domain errors versus form errors
* Accessible confirmations

**Main files or areas:**

```text
apps/web/src/features/transactions/
apps/web/src/components/forms/
apps/web/src/api/transactions.ts
```

**Dependencies:** Phase 14.

**Tests or verification:**

* Buy and sell form tests
* Invalid quantity tests
* API-domain error display
* Edit and delete tests
* Manual two-user isolation test
* Keyboard navigation check

**Completion criteria:**

* Users can complete the full manual transaction lifecycle.
* The browser does not use floating-point calculations as authoritative values.
* Errors do not destroy entered form data.

**Suggested commit:** `feat(web): add manual transaction management`

**Execution:** planning then implementation.

---

## Phase 16: Implement Weighted-Average Holding Calculation

**Exact goal:** Deterministically derive position quantity and estimated average cost from ordered transactions.

**What will be built:**

* Pure holding-calculation service
* Weighted-average cost calculation
* Fee treatment documented and implemented
* Realised portion handling needed to maintain remaining average cost
* Invalid-ledger detection
* Calculation result types
* Hand-calculated fixtures
* Methodology document

**What you will learn:**

* Weighted-average cost basis
* Pure domain functions
* Decimal arithmetic
* Trade ordering
* Why estimated cost basis is not a tax calculation
* Testing financial calculations

**Main files or areas:**

```text
services/api/src/holdings/calculations.py
services/api/src/holdings/types.py
services/api/tests/holdings/
docs/methodology/cost-basis.md
```

**Dependencies:** Phases 13 and 14.

**Tests or verification:**

* Single buy
* Multiple buys at different prices
* Partial sell
* Complete sell
* Buy after sell
* Fees
* Same-day deterministic ordering
* Oversell
* Zero remaining position
* Hand-checked expected values

**Completion criteria:**

* Identical ledgers produce identical results.
* No binary floating-point values are used.
* The methodology states assumptions and limitations.
* Tests cover all important transaction sequences.

**Suggested commit:** `feat(holdings): calculate weighted-average positions`

**Execution:** planning then implementation, with planning used heavily for understanding and independently checking the mathematics.

---

# Week 5: Holdings and Atomic CSV Import

## Phase 17: Expose Derived Holdings

**Exact goal:** Present transaction-derived holdings through Django and React before market prices are connected.

**What will be built:**

* Holdings selector
* Holdings endpoint
* Quantity
* Estimated average cost
* Estimated total cost
* Latest-price availability state
* Holdings table
* Empty-portfolio state
* Recalculation after transaction mutations

**What you will learn:**

* Read models
* Derived state
* Avoiding duplicated sources of truth
* Efficient transaction grouping
* API representation of unavailable data

**Main files or areas:**

```text
services/api/src/holdings/
apps/web/src/features/holdings/
```

**Dependencies:** Phase 16.

**Tests or verification:**

* Endpoint matches calculation service.
* Holdings update after add, edit and delete.
* Closed positions are excluded.
* Query-count test for multiple holdings.
* Frontend unavailable-price state test.

**Completion criteria:**

* The holdings table is fully derived from transactions.
* No user can directly edit a holding.
* Missing prices are represented explicitly, not as zero.

**Suggested commit:** `feat(holdings): expose transaction-derived holdings`

**Execution:** planning then implementation.

---

## Phase 18: Build the CSV Parsing and Preview Service

**Exact goal:** Parse the documented transaction CSV format and return a complete preview before committing data.

**What will be built:**

* CSV schema
* File-size and row-count limits
* Encoding rules
* Header validation
* Row parser
* Normalized preview result
* Row-level and file-level errors
* Duplicate-row detection
* Safe filename handling
* Sample CSV files

**What you will learn:**

* Untrusted file processing
* CSV ambiguity
* Validation pipelines
* Error accumulation
* File-upload security
* Separation of parsing and persistence

**Main files or areas:**

```text
services/api/src/imports/
services/api/tests/imports/
docs/product/csv-import.md
examples/transactions/
```

**Dependencies:** Phases 13 to 17.

**Tests or verification:**

* Valid file
* Missing columns
* Extra columns
* Invalid dates
* Invalid decimals
* Unsupported transaction type
* Duplicate rows
* Invalid encoding
* Empty file
* Excessive file size
* Malicious filename
* No database writes during preview

**Completion criteria:**

* A complete preview is produced without changing the database.
* Every invalid row has a stable row number and error code.
* The CSV format is publicly documented.

**Suggested commit:** `feat(imports): add transaction CSV validation preview`

**Execution:** planning then implementation.

---

## Phase 19: Implement Atomic CSV Import

**Exact goal:** Commit a validated transaction CSV as one atomic operation.

**What will be built:**

* Import batch model
* Preview token or normalized payload reference
* Atomic commit service
* Asset resolution against stored assets
* Ledger validation across imported and existing transactions
* Import summary
* Idempotency protection
* Rollback on any blocking error

**What you will learn:**

* Database transactions
* Atomic imports
* Idempotency
* Bulk creation
* Validation race conditions
* Import auditing

**Main files or areas:**

```text
services/api/src/imports/models.py
services/api/src/imports/services.py
services/api/src/imports/api/
```

**Dependencies:** Phase 18.

**Tests or verification:**

* Successful multi-row import
* One invalid row rolls back the complete batch
* Oversell rolls back the complete batch
* Duplicate submission does not duplicate transactions
* Existing transactions are included in validation
* Cross-user import protection
* Import audit record creation

**Completion criteria:**

* No partially imported portfolio can be created.
* Repeated submission is safe.
* Import state and summary are persisted.
* Failure leaves the pre-import portfolio unchanged.

**Suggested commit:** `feat(imports): commit transaction CSV files atomically`

**Execution:** planning then implementation.

---

## Phase 20: Build the CSV Import User Experience

**Exact goal:** Let users upload, preview, correct and commit transaction files.

**What will be built:**

* CSV upload page
* Downloadable template
* Preview table
* Error summary
* Row-level error display
* Commit confirmation
* Import-completion summary
* Import-history entry
* Clear replacement workflow after rejection

**What you will learn:**

* File uploads in React
* Multipart requests
* Large-table presentation
* Error-focused UX
* Multi-step workflows
* Import state management

**Main files or areas:**

```text
apps/web/src/features/imports/
apps/web/src/api/imports.ts
apps/web/public/examples/
```

**Dependencies:** Phases 18 and 19.

**Tests or verification:**

* Valid preview
* Invalid preview
* Commit flow
* Re-upload after correction
* Atomic failure display
* Template download
* Browser test confirming transactions and holdings appear after import

**Completion criteria:**

* A user can create a portfolio from the template CSV.
* No database commit occurs before explicit confirmation.
* Errors are actionable and tied to source rows.

**Suggested commit:** `feat(web): deliver transaction CSV import workflow`

**Execution:** planning then implementation.

---

# Week 6: Market-Data Service and First FastAPI Integration

## Phase 21: Define Shared Market-Data Contracts

**Exact goal:** Create provider-independent Pydantic contracts and the market-data FastAPI service shell.

**What will be built:**

* Shared contracts Python package
* `AssetReference`
* `AssetMetadata`
* `EndOfDayBar`
* `PriceSeries`
* `ProviderStatus`
* Typed provider errors
* Internal API versioning
* Market-data service health and readiness endpoints
* OpenAPI configuration

**What you will learn:**

* Pydantic validation
* Shared internal contracts
* Anti-corruption layers
* API versioning
* FastAPI dependency injection
* Contract ownership

**Main files or areas:**

```text
packages/contracts/src/quantora_contracts/
services/market-data/src/
services/market-data/tests/
```

**Dependencies:** Phase 2 and asset concepts from Phase 13.

**Tests or verification:**

* Pydantic validation
* Invalid price data rejection
* Serialization round trips
* Contract version field tests
* FastAPI health tests
* OpenAPI schema snapshot

**Completion criteria:**

* Provider-specific names do not appear in public contract fields.
* The service starts independently.
* Contracts can be imported by Django and FastAPI packages.

**Suggested commit:** `feat(contracts): define internal market-data API`

**Execution:** planning then implementation.

---

## Phase 22: Implement the Deterministic Fixture Provider

**Exact goal:** Build the first complete provider implementation without an external dependency.

**What will be built:**

* Provider protocol
* `FixtureProvider`
* Synthetic asset search
* Synthetic asset metadata
* Historical EOD endpoints
* Latest EOD endpoint
* Provider-status endpoint
* Deterministic synthetic files
* Error and delay simulation controls for tests

**What you will learn:**

* Adapter pattern
* Dependency injection
* Deterministic data generation
* Provider normalization
* Test doubles that behave like real integrations

**Main files or areas:**

```text
services/market-data/src/providers/
services/market-data/src/api/
services/market-data/fixtures/
```

**Dependencies:** Phase 21.

**Tests or verification:**

* Every provider protocol method
* Known deterministic values
* Missing symbol
* Missing date range
* Simulated timeout
* Simulated throttling
* Provider contract tests
* No network access during tests

**Completion criteria:**

* The service supports all required V1 market-data operations using fixtures.
* Repeated execution returns identical data.
* Fixture mode can power local and public-demo environments.

**Suggested commit:** `feat(market-data): implement deterministic fixture provider`

**Execution:** planning then implementation.

---

## Phase 23: Implement the Twelve Data Adapter

**Exact goal:** Add the primary live-development provider behind the same normalized interface.

**What will be built:**

* Twelve Data HTTP client
* Authentication configuration
* Asset search mapping
* Historical data mapping
* Latest EOD mapping
* Timeouts
* Error classification
* Rate-limit response handling
* Provider metadata
* Manually invoked live smoke test

**What you will learn:**

* Third-party API integration
* HTTP timeouts
* Rate limiting
* Response normalization
* Provider-specific error handling
* Why live tests are separated from CI

**Main files or areas:**

```text
services/market-data/src/providers/twelve_data/
services/market-data/tests/providers/
docs/operations/market-data-providers.md
```

**Dependencies:** Phases 21 and 22.

**Tests or verification:**

* Mocked successful responses
* Mocked rate-limit response
* Mocked timeout
* Invalid symbol
* Partial fields
* Malformed payload
* Shared provider contract suite
* Optional manual live test excluded from CI

**Completion criteria:**

* Twelve Data satisfies the same provider protocol as fixtures.
* No provider key can enter logs or API responses.
* CI passes with network access disabled.

**Suggested commit:** `feat(market-data): add Twelve Data provider adapter`

**Execution:** planning then implementation.

---

## Phase 24: Integrate Django with the Market-Data Service

**Exact goal:** Make Django consume normalized market data and persist accepted records in PostgreSQL.

**What will be built:**

* Django internal market-data client
* Historical-price model
* Provider-sync state
* Data-provenance fields
* Upsert service
* Fixture-ingestion management command
* Service timeout configuration
* Correlation-ID forwarding
* Internal-service error mapping

**What you will learn:**

* Service-to-service HTTP
* Client boundaries
* Durable normalization
* Idempotent upserts
* Provenance
* Partial failure handling

**Main files or areas:**

```text
services/api/src/market_data/
services/api/src/assets/models.py
services/api/src/core/clients/
services/api/management/commands/
```

**Dependencies:** Phases 21 to 23.

**Tests or verification:**

* Mock service response persistence
* Duplicate date upsert
* Provider-error mapping
* Timeout handling
* Contract-version mismatch
* Fixture ingestion
* Provenance fields
* PostgreSQL unique constraints

**Completion criteria:**

* Django can request fixture-provider prices from FastAPI.
* Accepted prices are durably stored.
* Re-running ingestion does not duplicate rows.
* Provider-specific response structures never enter Django models.

**Suggested commit:** `feat(api): integrate private market-data service`

**Execution:** planning then implementation.

### Week 6 milestone

**First FastAPI integration complete.**

Django now calls the private market-data service, validates shared contracts and persists normalized EOD data.

---

# Week 7: Celery, Background Jobs, and Provider Fallback

## Phase 25: Establish Celery and Persistent Job State

**Exact goal:** Run Celery worker and Beat locally while keeping authoritative job state in PostgreSQL.

**What will be built:**

* Celery application configuration
* Redis broker connection
* Worker container
* Beat container
* Queue definitions
* Shared task defaults
* Retry defaults
* Soft and hard time limits
* Persistent run-state fields
* Worker health documentation

Queues:

```text
imports
market-data
analysis
maintenance
```

**What you will learn:**

* Message brokers
* Worker processes
* Queue routing
* Task acknowledgement
* Retry configuration
* Difference between broker state and domain state

**Main files or areas:**

```text
services/api/src/quantora/celery.py
services/api/src/jobs/
docker-compose.yml
docs/architecture/background-jobs.md
```

**Dependencies:** Phase 5 and ADR for asynchronous jobs.

**Tests or verification:**

* Worker starts and consumes a test task.
* Beat starts as one scheduler.
* Broker interruption behaviour is observed.
* Task failure updates PostgreSQL.
* Queue routes are verified.
* Redis loss does not remove completed product results.

**Completion criteria:**

* Celery tasks execute through Docker Compose.
* PostgreSQL records canonical state.
* Queue and retry policies are documented.
* No meaningful payload history exists only in Redis.

**Suggested commit:** `feat(jobs): establish Celery worker and persistent task state`

**Execution:** planning then implementation.

---

## Phase 26: Move Large CSV Imports to Celery

**Exact goal:** Demonstrate the first user-visible asynchronous workflow using the existing CSV import service.

**What will be built:**

* Configurable synchronous threshold
* Celery import task
* Import job state
* Idempotency key
* Retry-safe persistence
* Import status endpoint
* React polling hook
* Import progress UI
* Retry action for recoverable failure

**What you will learn:**

* Reusing domain services inside tasks
* Idempotent background work
* Progress polling
* `202 Accepted`
* Synchronous versus asynchronous thresholds
* Avoiding duplicate imports

**Main files or areas:**

```text
services/api/src/imports/tasks.py
services/api/src/imports/models.py
apps/web/src/features/imports/progress/
```

**Dependencies:** Phases 19, 20 and 25.

**Tests or verification:**

* Small import remains synchronous when configured.
* Large import returns `202`.
* Polling shows status.
* Duplicate task delivery does not duplicate transactions.
* Failure rolls back data.
* Worker restart and retry behaviour
* Frontend resumes polling after page refresh

**Completion criteria:**

* A large import completes outside the HTTP request.
* Users can see queued, running, completed and failed states.
* Repeated submissions are safe.

**Suggested commit:** `feat(imports): process large CSV imports asynchronously`

**Execution:** planning then implementation.

### Milestone

**First asynchronous Celery workflow complete.**

---

## Phase 27: Implement Asynchronous Market Refresh

**Exact goal:** Fetch and store required EOD history through a retryable, deduplicated Celery workflow.

**What will be built:**

* Market-refresh task
* Portfolio asset discovery
* Freshness check
* Distributed refresh lock
* Provider-quota counter
* Missing-range calculation
* Retry classification
* Exponential backoff and jitter
* Market-sync run records
* Last-known-data behaviour

**What you will learn:**

* Distributed locks
* Cache stampede prevention
* Provider-aware retries
* Incremental data synchronization
* Idempotent upserts
* Stale-data policy

**Main files or areas:**

```text
services/api/src/market_data/tasks.py
services/api/src/market_data/services/
services/api/src/market_data/models.py
```

**Dependencies:** Phases 24 and 25.

**Tests or verification:**

* Fresh data avoids provider call.
* Missing date range is requested.
* Duplicate refreshes collapse behind a lock.
* Timeout retries.
* Invalid symbol does not retry.
* Rate-limit response backs off.
* Existing stored data survives provider failure.
* Stale state is recorded.

**Completion criteria:**

* Refresh requests do not block Django HTTP workers.
* Duplicate jobs do not multiply provider requests.
* Failure leaves valid stored data intact.
* Freshness and provider outcome are persisted.

**Suggested commit:** `feat(market-data): add asynchronous EOD refresh workflow`

**Execution:** planning then implementation.

---

## Phase 28: Add Alpha Vantage and Explicit Provider Fallback

**Exact goal:** Complete the locked dual-provider strategy without creating silent mixed datasets.

**What will be built:**

* Alpha Vantage adapter
* Provider selection policy
* Environment-specific provider order
* Explicit fallback metadata
* Provider quota state
* Circuit-breaker-style temporary failure markers
* No-cross-provider-series rule
* Provider health endpoint expansion
* Shared contract tests for all three adapters

**What you will learn:**

* Multi-provider architecture
* Fallback tradeoffs
* Quota management
* Data reconciliation risks
* Circuit breaking
* Provider observability

**Main files or areas:**

```text
services/market-data/src/providers/alpha_vantage/
services/market-data/src/provider_registry.py
services/api/src/market_data/provider_policy.py
```

**Dependencies:** Phases 22, 23 and 27.

**Tests or verification:**

* Alpha Vantage contract suite
* Primary success prevents fallback.
* Retryable primary failure permits configured fallback.
* Non-retryable invalid symbol behaves consistently.
* Public demo always selects fixtures.
* Analysis cannot mix providers silently.
* Fallback metadata reaches PostgreSQL.

**Completion criteria:**

* Fixture, Twelve Data and Alpha Vantage implement one interface.
* Provider choice is environment-driven.
* Fallback is visible and traceable.
* Automated tests remain completely offline.

**Suggested commit:** `feat(market-data): add fallback provider strategy`

**Execution:** planning then implementation.

---

# Week 8: Risk-Engine Foundation and Core Calculations

## Phase 29: Create the Risk-Engine Service and Calculation Contracts

**Exact goal:** Establish the stateless risk-engine FastAPI service with deterministic, versioned inputs and outputs.

**What will be built:**

* Risk-engine FastAPI project
* Analysis request contracts
* Holding snapshot contracts
* Price-series contracts
* Metric result contract
* Formula-version fields
* Sufficiency status
* Warning and reason codes
* Health and readiness endpoints
* Pure calculation module structure

**What you will learn:**

* Stateless computational services
* Numerical-contract design
* Formula versioning
* Sufficiency versus failure
* Pure functions
* API boundary design

**Main files or areas:**

```text
services/risk-engine/src/
packages/contracts/src/quantora_contracts/risk/
services/risk-engine/tests/
```

**Dependencies:** Phase 21 and locked metric definitions.

**Tests or verification:**

* Contract validation
* Invalid dates
* Duplicate observations
* Missing assets
* Unsupported currencies
* Formula version output
* Health and OpenAPI tests

**Completion criteria:**

* The service accepts a complete synthetic analysis request.
* Invalid input is rejected before calculation.
* No database or provider dependency exists.

**Suggested commit:** `feat(risk-engine): establish deterministic analytics service`

**Execution:** planning then implementation.

---

## Phase 30: Calculate Value, Allocation, and Unrealised P/L

**Exact goal:** Implement the simplest complete deterministic risk-engine response.

**What will be built:**

* Latest portfolio value
* Per-holding market value
* Allocation percentages
* Estimated unrealised P/L
* Monetary and percentage P/L
* Decimal-to-numeric boundary policy
* Missing-price handling
* Calculation methodology

**What you will learn:**

* Portfolio valuation
* Allocation
* Cost basis versus market value
* Precision boundaries
* Handling incomplete prices
* Independent expected-result verification

**Main files or areas:**

```text
services/risk-engine/src/calculations/valuation.py
services/risk-engine/tests/calculations/
docs/methodology/valuation.md
```

**Dependencies:** Phases 16 and 29.

**Tests or verification:**

* Single holding
* Multiple holdings
* Zero-value edge case
* Missing latest price
* Closed position
* Positive and negative P/L
* Allocation sums within documented tolerance
* Hand-calculated fixture

**Completion criteria:**

* The service returns correct deterministic valuation results.
* Missing prices produce unavailable results rather than invented values.
* Methodology matches implementation.

**Suggested commit:** `feat(risk-engine): calculate portfolio valuation metrics`

**Execution:** planning then implementation.

### Milestone

**First deterministic risk calculation complete.**

---

## Phase 31: Calculate Daily Returns and Annualised Volatility

**Exact goal:** Build a portfolio return series that respects transaction timing and calculate historical volatility.

**What will be built:**

* Adjusted-price asset returns
* Previous-day holding-weight calculation
* Portfolio daily return series
* Transaction timing rule
* Missing-data alignment
* Annualised volatility using 252 trading days
* Minimum 30-observation rule
* Trailing-period selection
* Sufficiency warnings

**What you will learn:**

* Daily returns
* Portfolio weighting
* External cash-flow distortion
* Annualisation
* Time-series alignment
* Observation sufficiency

**Main files or areas:**

```text
services/risk-engine/src/calculations/returns.py
services/risk-engine/src/calculations/volatility.py
docs/methodology/returns-and-volatility.md
```

**Dependencies:** Phases 29 and 30.

**Tests or verification:**

* Constant-price series
* Positive and negative returns
* Purchase during analysis period
* Sale during analysis period
* Missing trading date
* Different asset listing histories
* Fewer than 30 observations
* Known volatility fixture
* Property test for constant series producing zero volatility

**Completion criteria:**

* Contributions and withdrawals caused by trades are not counted as portfolio performance.
* Volatility reports its period and observation count.
* Insufficient data returns an explicit unavailable state.

**Suggested commit:** `feat(risk-engine): calculate daily returns and volatility`

**Execution:** planning then implementation, with manual formula reconstruction required before completion.

---

## Phase 32: Calculate Drawdown and Concentration

**Exact goal:** Add the locked historical loss and current concentration measurements.

**What will be built:**

* Cumulative return index
* Running peak
* Drawdown series
* Maximum drawdown
* Largest holding weight
* Top-three holding weight
* HHI concentration value
* Neutral reason codes
* Metric limitations

**What you will learn:**

* Peak-to-trough decline
* Cumulative returns
* Concentration measures
* HHI
* Why measurement is not recommendation
* Edge cases in risk metrics

**Main files or areas:**

```text
services/risk-engine/src/calculations/drawdown.py
services/risk-engine/src/calculations/concentration.py
docs/methodology/drawdown.md
docs/methodology/concentration.md
```

**Dependencies:** Phases 30 and 31.

**Tests or verification:**

* Monotonically rising portfolio
* Single decline and recovery
* Multiple drawdowns
* Drawdown continuing at period end
* One-holding portfolio
* Equal-weight portfolio
* Top-three with fewer than three holdings
* HHI bounds
* Hand-calculated examples

**Completion criteria:**

* Drawdown and concentration values match independently checked fixtures.
* Results contain no “safe”, “unsafe”, “good” or “bad” classification.
* Calculation limitations are documented.

**Suggested commit:** `feat(risk-engine): add drawdown and concentration metrics`

**Execution:** planning then implementation.

---

# Week 9: Benchmark, Scenario, and End-to-End Analysis

## Phase 33: Implement Source-Independent Benchmark Comparison

**Exact goal:** Compare portfolio cumulative return with the configured benchmark over an identical valid period while keeping the calculation independent from the benchmark's provider or synthetic source.

**What will be built:**

* Benchmark input contract
* Benchmark identifier and display name
* Synthetic-data indicator
* Provider and provenance metadata
* Common-date alignment
* Portfolio cumulative return
* Benchmark cumulative return
* Return difference
* Apache ECharts-compatible chart-series output
* Missing-benchmark handling
* Benchmark period and freshness metadata
* Environment-specific benchmark selection:

  * Actual SPY in provider-enabled private development where permitted
  * Deterministic fixture benchmark in automated tests
  * Clearly fictional broad-market benchmark in the public synthetic demo

**What you will learn:**

* Benchmark alignment
* Normalized growth series
* Fair comparison periods
* Missing observations
* Source-independent calculation design
* Data provenance
* Why historical outperformance is not predictive
* Why synthetic benchmark data must never be presented as real market data

**Main files or areas:**

```text
services/risk-engine/src/calculations/benchmark.py
services/risk-engine/tests/calculations/test_benchmark.py
packages/contracts/src/quantora_contracts/risk/
docs/methodology/benchmark-comparison.md
```

**Dependencies:** Phase 31.

**Tests or verification:**

* Identical portfolio and benchmark series
* Portfolio outperforming the benchmark
* Portfolio underperforming the benchmark
* Misaligned start dates
* Missing benchmark dates
* Insufficient overlapping history
* Equal-period enforcement
* Synthetic benchmark label propagation
* Mocked provider-enabled SPY metadata
* Identical calculation results for equivalent real and synthetic input series
* Confirmation that automated tests make no live provider calls
* Confirmation that the public-demo benchmark is never labelled as SPY

**Completion criteria:**

* Portfolio and benchmark series use the same valid dates.
* One calculation path works with both provider-backed and synthetic benchmark data.
* Results include benchmark identity, display name, source, synthetic status, data period, and freshness.
* Provider-enabled private development can identify the benchmark as SPY when actual SPY data is used legally.
* The public demo identifies its benchmark as a fictional synthetic broad-market benchmark.
* No result implies future outperformance.

**Suggested commit:** `feat(risk-engine): add source-independent benchmark comparison`

**Execution:** planning then implementation.

---

## Phase 34: Implement Static Price-Shock Scenarios

**Exact goal:** Calculate the immediate hypothetical effect of user-selected holding price shocks.

**What will be built:**

* Scenario request contract
* One or multiple holding shocks
* Pre-scenario value
* Post-scenario value
* Monetary change
* Percentage change
* Per-holding contribution
* Input limits
* Static and instantaneous assumption metadata

**What you will learn:**

* Scenario analysis
* Contribution calculation
* Hypothetical versus predicted outcomes
* Input bounds
* Explainability
* Safe financial wording

**Main files or areas:**

```text
services/risk-engine/src/calculations/scenario.py
services/risk-engine/tests/calculations/test_scenario.py
docs/methodology/scenario-analysis.md
```

**Dependencies:** Phase 30.

**Tests or verification:**

* One negative shock
* One positive shock
* Multiple shocks
* Zero shock
* Unknown holding
* Excessive input
* Contributions sum to total change
* Unshocked holdings remain unchanged

**Completion criteria:**

* Results are deterministic.
* Scenario limitations accompany the result.
* No probability or prediction is calculated.

**Suggested commit:** `feat(risk-engine): add static price-shock scenarios`

**Execution:** planning then implementation.

---

## Phase 35: Orchestrate Portfolio Analysis

**Exact goal:** Create the Celery workflow that prepares data, calls the risk engine and tracks analysis stages.

**What will be built:**

* `AnalysisRun` model
* Analysis-request endpoint
* Input hash and idempotency key
* Market-data prerequisite check
* Market-refresh chaining
* Historical holding reconstruction
* Risk-engine client
* Stage updates
* Retry rules
* Failure classification

Stages:

```text
VALIDATING_INPUT
CHECKING_MARKET_DATA
FETCHING_MARKET_DATA
BUILDING_TIME_SERIES
CALCULATING_METRICS
SAVING_RESULTS
COMPLETED
```

**What you will learn:**

* Workflow orchestration
* Task composition
* Historical position reconstruction
* Idempotency
* Service failure handling
* Progress state machines

**Main files or areas:**

```text
services/api/src/analysis/models.py
services/api/src/analysis/tasks.py
services/api/src/analysis/services/
services/api/src/core/clients/risk_engine.py
```

**Dependencies:** Phases 27 and 29 to 34.

**Tests or verification:**

* Complete fixture-provider run
* Duplicate analysis request
* Missing market history
* Market refresh failure
* Risk-engine timeout
* Invalid risk response
* Worker retry
* Stage transition rules
* User cannot request analysis for another user's portfolio

**Completion criteria:**

* Analysis runs outside the HTTP request.
* Duplicate inputs return or reuse the existing active run.
* Failures have safe user messages and detailed internal references.
* Stage transitions are valid and persisted.

**Suggested commit:** `feat(analysis): orchestrate asynchronous portfolio analytics`

**Execution:** planning then implementation.

---

## Phase 36: Persist and Expose Complete Analysis Results

**Exact goal:** Complete the first backend end-to-end portfolio analysis from transactions to stored results.

**What will be built:**

* Immutable metric-result model
* Holding-result records
* Return-series storage decision implementation
* Benchmark-series result
* Scenario-run persistence
* Analysis status endpoint
* Analysis result endpoint
* Result version and formula version
* Data provenance
* Freshness fields
* Recalculation rules

**What you will learn:**

* Immutable analytical results
* Reproducibility
* Snapshot design
* Result versioning
* Data provenance
* Read API composition

**Main files or areas:**

```text
services/api/src/analysis/results/
services/api/src/scenarios/
services/api/src/analysis/api/
services/api/tests/analysis/
```

**Dependencies:** Phase 35.

**Tests or verification:**

* Full fixture analysis
* Exact stored metrics
* Formula versions
* Provider and as-of metadata
* Analysis results remain unchanged after later transaction edits.
* New transaction version generates a new analysis.
* Scenario persistence
* API ownership tests

**Completion criteria:**

* A transaction portfolio can be analysed from beginning to end.
* Every result references its input version, methodology version and data date.
* Completed results can be read without recalculation.

**Suggested commit:** `feat(analysis): persist reproducible portfolio results`

**Execution:** planning then implementation.

### Week 9 milestone

**First end-to-end portfolio analysis complete.**

The backend can now turn transactions and EOD prices into all locked V1 metrics.

---

# Week 10: Product Dashboard, Explainability, and Demo Mode

## Phase 37: Build the Portfolio Valuation Dashboard

**Exact goal:** Present the most important current portfolio results clearly using a reusable Apache ECharts foundation.

**What will be built:**

* Portfolio value card
* Estimated unrealised P/L
* Allocation chart using Apache ECharts
* Reusable Apache ECharts React wrapper
* Shared chart option and formatting utilities
* Accessible chart summaries
* Holdings valuation table
* Latest price dates
* Analysis status banner
* Refresh-analysis action
* Empty and unavailable states
* Foundations for future ECharts time-series charts, drawdown visualisations, scenario charts, treemaps, and heatmaps

**What you will learn:**

* Financial dashboard hierarchy
* Apache ECharts integration with React and TypeScript
* Reusable chart-component design
* Accessible data visualisation
* Loading versus stale states
* Server-authoritative values
* Responsive dashboard composition

**Main files or areas:**

```text
apps/web/src/features/dashboard/
apps/web/src/features/analysis/
apps/web/src/components/charts/
apps/web/src/components/charts/EChartsRenderer.tsx
apps/web/src/components/charts/options/
```

**Dependencies:** Phase 36.

**Tests or verification:**

* Dashboard component tests
* Apache ECharts wrapper tests
* Positive and negative P/L
* Missing price
* Stale data
* Empty portfolio
* Queued and running analysis
* Chart data equals API values
* Allocation percentages match the holdings table
* The table remains usable without the chart
* Chart instances are disposed correctly when components unmount

**Completion criteria:**

* Users can understand current tracked value and composition quickly.
* Every displayed price has an as-of date.
* Apache ECharts is the only general-purpose charting library installed.
* Charts do not become a separate calculation source.
* Allocation information remains available through an accessible table or text summary.

**Suggested commit:** `feat(web): add Apache ECharts portfolio dashboard`

**Execution:** planning then implementation.

---

## Phase 38: Build the Historical Risk Dashboard

**Exact goal:** Present returns, volatility, drawdown, concentration, and benchmark comparison using Apache ECharts and accurate benchmark labelling.

**What will be built:**

* Cumulative-return chart using Apache ECharts
* Portfolio-versus-benchmark chart using Apache ECharts
* Drawdown visualisation using Apache ECharts
* Annualised-volatility card
* Maximum-drawdown card
* Largest-holding, top-three, and HHI cards
* Analysis-period selector where supported
* Observation-count display
* Benchmark identity and synthetic-data label
* Benchmark provider, provenance, and as-of date
* Insufficient-data states
* Accessible chart summaries
* Chart tooltips and legends

The benchmark label shown in the interface must reflect the actual analysis input:

* `SPY` only when actual SPY data is being used in permitted provider-enabled private development
* A clearly fictional broad-market benchmark name in automated fixtures and the public synthetic demo
* A visible `Synthetic benchmark` label in the public demo

**What you will learn:**

* Risk-metric presentation
* Apache ECharts time-series configuration
* Drawdown visualisation
* Benchmark visualisation
* Data-sufficiency communication
* Accessible chart alternatives
* Avoiding misleading axes and scales
* Presenting real and synthetic benchmark provenance correctly

**Main files or areas:**

```text
apps/web/src/features/risk/
apps/web/src/components/charts/
apps/web/src/components/charts/options/returns.ts
apps/web/src/components/charts/options/drawdown.ts
apps/web/src/api/analysis.ts
```

**Dependencies:** Phases 31 to 33 and 36.

**Tests or verification:**

* Complete result
* Insufficient history
* Zero volatility
* Zero drawdown
* Highly concentrated portfolio
* Missing benchmark
* Real SPY label in mocked provider-enabled mode
* Synthetic benchmark label in fixture and public-demo mode
* Confirmation that synthetic data is never described as actual SPY data
* Chart and table equivalence
* Tooltip formatting
* Screen-reader summaries
* ECharts cleanup on component unmount

**Completion criteria:**

* Every locked historical metric is visible.
* Unavailable metrics explain why.
* Portfolio and benchmark use the same valid period.
* The benchmark's actual identity, source, synthetic status, and data date are visible.
* The public demo never labels fictional benchmark data as SPY.
* Apache ECharts is used for all general-purpose historical-risk charts.
* The interface does not classify the portfolio or recommend actions.

**Suggested commit:** `feat(web): present historical risk with Apache ECharts`

**Execution:** planning then implementation.

---

## Phase 39: Build Scenario Analysis and Explainability

**Exact goal:** Complete the user-facing scenario workflow, including an Apache ECharts scenario-impact visualisation and safe deterministic explanations.

**What will be built:**

* Scenario builder
* Holding shock inputs
* Validation limits
* Scenario submission
* Before-and-after value comparison
* Per-holding contribution table
* Scenario-impact chart using Apache ECharts
* Deterministic explanation templates
* Metric methodology drawers or pages
* Assumptions and limitation panels
* Required disclaimers

**What you will learn:**

* Explainable analytics
* Controlled financial language
* Apache ECharts scenario visualisation
* Template-based insights
* Scenario UX
* Methodology presentation
* Difference between hypothetical analysis and prediction

**Main files or areas:**

```text
apps/web/src/features/scenarios/
apps/web/src/features/methodology/
apps/web/src/components/charts/options/scenario.ts
services/api/src/insights/
docs/methodology/
```

**Dependencies:** Phases 34 and 36.

**Tests or verification:**

* Single and multiple shocks
* Invalid values
* Scenario result rendering
* Contribution totals
* Scenario chart values equal API results
* Required disclaimer visibility
* Forbidden-word automated content test
* Methodology links
* Neutral template snapshots
* Accessible text alternative for the scenario chart
* Confirmation that no second general-purpose charting library is installed

**Completion criteria:**

* Users can complete the locked scenario workflow.
* Every scenario is visibly hypothetical.
* No generated text provides recommendations or predictions.
* Every metric has accessible methodology.
* Apache ECharts is used for the scenario visualisation.

**Suggested commit:** `feat(scenarios): add explainable ECharts scenario analysis`

**Execution:** planning then implementation.

---

## Phase 40: Complete Synthetic Demo Mode

**Exact goal:** Make the full product reproducible without live providers or manual data preparation, while ensuring that all fictional market and benchmark data is labelled accurately.

**What will be built:**

* Deterministic fictional assets
* Deterministic fictional price histories
* A clearly fictional broad-market benchmark
* Benchmark metadata with `is_synthetic = true`
* A fictional benchmark name that cannot be confused with SPY
* Multiple synthetic market regimes
* Concentrated sample portfolio
* Diversified sample portfolio
* Demo user bootstrap command
* Demo transaction imports
* Demo price ingestion
* Demo analysis generation
* Visible synthetic-data labels
* Visible synthetic-benchmark label
* Reset mechanism

The public demo must never:

* Label the fictional benchmark as SPY
* Claim that the benchmark contains actual SPY prices
* Suggest that fictional market data is current real-world data
* Make a live market-data provider call

The synthetic benchmark must pass through the same benchmark-calculation contract and workflow used for real SPY data in provider-enabled private development.

**What you will learn:**

* Deterministic data generation
* Demo-environment design
* Reproducibility
* Seed scripts
* Source-independent benchmark processing
* Safe public-data presentation
* Product demonstration planning

**Main files or areas:**

```text
services/market-data/fixtures/demo/
services/market-data/fixtures/demo/benchmark/
services/api/src/demo/
scripts/demo/
docs/product/demo-workflow.md
```

**Dependencies:** Phases 22 and 35 to 39.

**Tests or verification:**

* Two fresh resets produce identical results.
* Demo mode never calls Twelve Data or Alpha Vantage.
* All demo assets are labelled fictional or synthetic.
* The public-demo benchmark is clearly labelled synthetic.
* Repository and UI searches confirm the synthetic benchmark is never labelled as SPY.
* The benchmark calculation follows the same workflow as provider-backed benchmark analysis.
* Demo mode produces every V1 metric.
* Reset is idempotent.
* Demo user cannot see non-demo user records.

**Completion criteria:**

* A fresh environment becomes demonstration-ready through one documented command.
* The complete V1 workflow works offline.
* The public demo clearly distinguishes synthetic assets and its synthetic broad-market benchmark from real market data.
* The public demonstration does not depend on Twelve Data, Alpha Vantage, or actual SPY data.
* Benchmark calculations use the same risk-engine logic in synthetic and provider-enabled modes.

**Suggested commit:** `feat(demo): add clearly labelled synthetic benchmark mode`

**Execution:** planning then implementation.

### Week 10 milestone

**Local V1 feature scope complete.**

All locked product capabilities now work locally with deterministic data.

---

# Week 11: Full Azure Platform and CI/CD

## Phase 41: Expand Bicep to the Complete Platform

**Exact goal:** Define every locked Azure resource and service deployment through modular Bicep.

**What will be built:**

* Azure Managed Redis
* Market-data Container App
* Risk-engine Container App
* Worker Container App
* Beat Container App
* Key Vault
* Application Insights
* Internal service ingress
* Managed identities
* Key Vault access
* PostgreSQL configuration
* Redis configuration
* Container App scaling limits
* Complete outputs and tags

**What you will learn:**

* Private service topology
* Container Apps scaling
* Managed identity
* Key Vault references
* Cloud networking
* Redis production concerns
* Cost-aware infrastructure design

**Main files or areas:**

```text
infra/bicep/main.bicep
infra/bicep/modules/
infra/bicep/environments/
docs/architecture/azure-topology.md
```

**Dependencies:** Phase 11 and all service boundaries.

**Tests or verification:**

* Bicep lint and build
* Development `what-if`
* Private services have no public ingress.
* Worker and Beat have no ingress.
* Beat has exactly one replica.
* Secret values are not Bicep outputs.
* Cost estimate and scale limits reviewed.

**Completion criteria:**

* Bicep describes the complete locked Azure architecture.
* Only React and Django have public application entry points.
* Internal service URLs are environment-provided.
* Secrets are Key Vault references.

**Suggested commit:** `infra: define complete Quantora Azure platform`

**Execution:** planning then implementation.

---

## Phase 42: Deploy All Services and Validate Private Communication

**Exact goal:** Run Django, both FastAPI services, Celery worker and Beat in Azure.

**What will be built:**

* Service-specific production images
* Images pushed to ACR
* Internal FastAPI endpoints
* Worker and Beat revisions
* Managed Redis connections
* Key Vault references
* Database migration procedure
* Service startup probes
* Private service authentication or trusted-network controls

**What you will learn:**

* Multi-service deployment
* Container App revisions
* Internal DNS
* Cloud worker operation
* Secret references
* Startup ordering
* Distributed debugging

**Main files or areas:**

```text
services/*/Dockerfile
infra/bicep/
scripts/deploy/
docs/operations/service-deployment.md
```

**Dependencies:** Phase 41.

**Tests or verification:**

* Django can reach both private services.
* Browser cannot reach private FastAPI endpoints.
* Celery worker consumes Redis messages.
* Beat enqueues one scheduled task.
* Fixture analysis completes in Azure.
* Restarted worker does not corrupt a run.
* Logs contain shared correlation IDs.

**Completion criteria:**

* The complete service topology runs in Azure.
* A cloud analysis reaches both FastAPI services.
* Private services have no public endpoint.
* Failure of one private service is visible but does not expose internals.

**Suggested commit:** `deploy: run complete Quantora service topology in Azure`

**Execution:** planning then implementation.

---

## Phase 43: Implement GitHub Actions CI/CD with OIDC

**Exact goal:** Automate validated infrastructure and application deployment without long-lived Azure secrets.

**What will be built:**

* Pull-request CI
* Python workspace checks
* Frontend checks
* Contract tests
* Docker image builds
* Bicep validation and `what-if`
* GitHub OIDC login
* ACR push
* Container App deployment
* Static Web Apps deployment
* Explicit migration job
* Protected production environment
* Deployment concurrency control

**What you will learn:**

* CI versus CD
* Federated identity
* Build artefacts
* Deployment ordering
* Environment approvals
* Migration safety
* Rollback boundaries

**Main files or areas:**

```text
.github/workflows/ci.yml
.github/workflows/deploy-development.yml
.github/workflows/deploy-production.yml
.github/workflows/infrastructure.yml
```

**Dependencies:** Phases 41 and 42.

**Tests or verification:**

* Pull request cannot deploy.
* CI failure blocks deployment.
* OIDC login works without an Azure password.
* Frozen lockfile installation
* Bicep `what-if` output is reviewable.
* Failed migration prevents app promotion.
* Duplicate deployments are serialized.
* Rollback runbook tested on development.

**Completion criteria:**

* Main-branch changes deploy to development automatically or through one protected approval.
* Production requires explicit approval.
* No Azure client secret is stored in GitHub.
* Images are traceable to commit SHA.

**Suggested commit:** `ci: automate Azure deployment with GitHub OIDC`

**Execution:** planning then implementation.

---

## Phase 44: Complete the Cloud MVP Acceptance Run

**Exact goal:** Prove every V1 workflow against the complete Azure environment.

**What will be built:**

* Cloud smoke-test script
* Baseline Application Insights connection
* Deployment verification checklist
* Demo reset process
* Cloud database backup check
* Failure-recovery runbook
* MVP release tag
* Known-limitations document

**What you will learn:**

* Release acceptance
* Cloud smoke testing
* Operational readiness
* Environment verification
* Known-risk documentation
* Release tagging

**Main files or areas:**

```text
scripts/smoke/
docs/operations/release-checklist.md
docs/product/known-limitations.md
.github/workflows/
```

**Dependencies:** Phases 40 to 43.

**Tests or verification:**

Run the full cloud workflow:

1. Register.
2. Log in.
3. Create a portfolio.
4. Add manual transactions.
5. Upload a CSV.
6. Review derived holdings.
7. Start analysis.
8. Poll progress.
9. View all metrics.
10. Compare the portfolio with the environment's configured benchmark.
11. Confirm that the public demo labels its fictional broad-market benchmark as synthetic and never as SPY.
12. Run a scenario.
13. Log out.
14. Verify user isolation.

Also verify:

* Provider-enabled private development can use and identify actual SPY data where provider terms permit it.
* Automated tests and the public demo use deterministic benchmark fixtures.
* The benchmark-calculation workflow is identical for provider-backed and synthetic input.
* Provider failure falls back correctly.
* Demo mode performs no external provider calls.
* Stale state is shown.
* Worker retry works.
* Application logs are available.
* Private services remain private.
* Apache ECharts renders allocation, cumulative-return, benchmark, drawdown, and scenario visualisations correctly.
* No second general-purpose charting library is present in the frontend dependency tree.

**Completion criteria:**

* Every locked V1 workflow passes in Azure.
* Baseline telemetry exists.
* Deployment is repeatable.
* Known limitations are honest and public.
* Release is tagged as the cloud MVP.

**Suggested commit:** `release: complete Quantora cloud MVP acceptance`

**Execution:** planning then implementation.

### Week 11 milestones

* **Complete Azure architecture deployed**
* **MVP complete**

---

# Week 12: Hardening and Strong Portfolio Release

## Phase 45: Expand OpenTelemetry and Operational Visibility

**Exact goal:** Make requests and jobs traceable across Django, Celery and both FastAPI services.

**What will be built:**

* OpenTelemetry initialization
* Django request instrumentation
* FastAPI instrumentation
* HTTP client instrumentation
* PostgreSQL instrumentation where appropriate
* Celery task spans
* Correlation-ID propagation
* Structured JSON logging
* Dependency timing
* Application Insights dashboards
* Basic alerts
* Log-redaction rules

**What you will learn:**

* Distributed tracing
* Spans and traces
* Correlation IDs
* Service dependencies
* Operational dashboards
* Alert quality
* Sensitive-log handling

**Main files or areas:**

```text
services/*/src/*/observability/
services/api/src/jobs/
infra/bicep/modules/monitoring.bicep
docs/operations/observability.md
```

**Dependencies:** Phase 44.

**Tests or verification:**

* One analysis has a trace spanning Django, Celery, market data and risk engine.
* Correlation IDs remain consistent.
* Provider key and credentials never appear.
* Failed service call appears as an error span.
* Alert test reaches the configured destination.
* Logging still works without Application Insights locally.

**Completion criteria:**

* A failed analysis can be investigated from one correlation reference.
* Main service latencies are visible.
* Logs are structured and redacted.
* Monitoring setup is documented.

**Suggested commit:** `feat(observability): add distributed tracing and monitoring`

**Execution:** planning then implementation.

---

## Phase 46: Harden Security, Rate Limits, and Failure Behaviour

**Exact goal:** Review and strengthen the external and internal security boundaries.

**What will be built:**

* Registration and login throttles
* Analysis-request throttle
* CSV-upload limits
* Provider-quota enforcement
* Secure-header review
* Production cookie review
* Strict CORS and CSRF configuration
* Permission audit
* Dependency vulnerability scanning
* Container scanning
* Secret scanning
* Safe error responses
* Redis key-prefix and TTL review

**What you will learn:**

* Threat modelling
* Abuse controls
* Rate limiting
* Secure cookies
* CORS and CSRF differences
* Dependency risk
* Failure-information leakage

**Main files or areas:**

```text
services/api/src/core/security/
services/api/src/core/throttling/
.github/workflows/security.yml
docs/security/threat-model.md
```

**Dependencies:** Phases 44 and 45.

**Tests or verification:**

* Authentication brute-force throttle
* Analysis spam throttle
* CSV size rejection
* Cross-origin denial
* CSRF denial
* Cross-user endpoint audit
* Secret scan
* Dependency scan
* Container scan
* Error responses do not include stack traces

**Completion criteria:**

* A written threat model covers authentication, files, providers, jobs and service boundaries.
* Abuse limits are enforced.
* CI reports dependency and secret problems.
* All user-owned endpoints have isolation tests.

**Suggested commit:** `security: harden Quantora application boundaries`

**Execution:** planning then implementation, with planning used for threat modelling.

---

## Phase 47: Complete the Test Pyramid and Failure Suite

**Exact goal:** Raise confidence from feature-level testing to release-level system verification.

**What will be built:**

* Broader unit coverage
* Provider contract suite
* Risk-engine parameterized tests
* API integration suite
* PostgreSQL integration tests
* Celery eager and real-worker tests where appropriate
* Failure-injection tests
* Playwright primary workflow
* Playwright isolation workflow
* Coverage reports
* Deterministic CI fixtures
* Flake investigation policy

**What you will learn:**

* Test pyramids
* Contract testing
* Worker testing
* End-to-end testing
* Failure injection
* Coverage interpretation
* Deterministic test design

**Main files or areas:**

```text
services/*/tests/
apps/web/src/**/*.test.tsx
apps/web/e2e/
.github/workflows/ci.yml
docs/testing/
```

**Dependencies:** All functional phases.

**Tests or verification:**

Required CI groups:

* Python lint and format
* Python typing
* Django unit and integration tests
* Market-data contract tests
* Risk-engine tests
* React unit and component tests
* Frontend type check
* Frontend production build
* Frontend charting-dependency check confirming the official Apache ECharts (`echarts`) package is present and that `recharts`, `chart.js`, `react-chartjs-2`, `highcharts`, `victory`, and `nivo` are absent
* Playwright smoke flow
* Bicep validation
* Docker image build

Required failure cases:

* Provider timeout
* Provider throttling
* Redis interruption
* Risk-engine timeout
* Invalid internal contract
* Insufficient history
* Duplicate task delivery
* Worker retry
* Cross-user access
* Invalid CSV

**Completion criteria:**

* The main demo workflow is automated.
* Risk-engine calculation code reaches the locked high-confidence coverage target.
* No test requires a live provider.
* CI is deterministic enough for reliable pull-request use.

**Suggested commit:** `test: complete Quantora release verification suite`

**Execution:** planning then implementation.

---

## Phase 48: Publish the Strong Portfolio Version

**Exact goal:** Turn the completed system into a compelling, understandable engineering portfolio project.

**What will be built:**

* Final README
* Product screenshots
* Architecture overview
* Mermaid or exported architecture diagrams
* Local setup
* Azure deployment explanation
* API documentation links
* Calculation methodology index
* Testing strategy
* Security overview
* Observability overview
* ADR index
* Tradeoff discussion
* Known limitations
* Future roadmap
* Five-minute demo script
* Interview explanation notes
* Strong portfolio release tag

**What you will learn:**

* Technical storytelling
* Architecture communication
* Explaining tradeoffs
* Presenting complexity honestly
* Connecting implementation to business value
* Interview-ready project explanation

**Main files or areas:**

```text
README.md
docs/architecture/
docs/methodology/
docs/testing/
docs/security/
docs/operations/
docs/case-study/
```

**Dependencies:** Phases 1 to 47.

**Tests or verification:**

* Fresh-clone setup test
* Documentation link check
* Five-minute demo rehearsal
* Architecture diagram compared with actual deployment
* README reviewed by a non-project reader
* All screenshots match the current UI
* Frontend dependency verification confirms the official Apache ECharts (`echarts`) package is present and that `recharts`, `chart.js`, `react-chartjs-2`, `highcharts`, `victory`, and `nivo` are absent
* Repository contains no secrets or assistant-specific traces
* CV claims compared against actual implementation

**Completion criteria:**

* A recruiter understands the project quickly.
* An engineer can inspect implementation depth.
* A new developer can run the system.
* Every major architectural claim is supported by code and documentation.
* The strong portfolio release is tagged and publicly presentable.

**Suggested commit:** `release: publish Quantora strong portfolio version`

**Execution:** planning then implementation, with planning leading the case-study and interview review.

### Week 12 milestone

**Strong portfolio version complete.**

---

# 4. Optional Polish Roadmap

# Week 13: UX, Accessibility, and Responsive Design

## Phase 49: Refine the Visual System and Dashboard UX

**Goal:** Make visual hierarchy, spacing, typography, cards, tables and charts consistent.

**Build:** Reusable design tokens, final component patterns, skeletons, refined empty states and visual consistency review.

**Learn:** Design systems, information hierarchy and dashboard usability.

**Areas:** `apps/web/src/components/`, design documentation and Storybook if justified.

**Dependencies:** Phase 48.

**Verification:** Visual regression checks, component review and representative screen comparison.

**Completion:** Core pages look and behave like one coherent product.

**Commit:** `refactor(web): unify dashboard design system`

**Execution:** planning then implementation.

---

## Phase 50: Complete an Accessibility Audit

**Goal:** Reach a strong practical accessibility standard.

**Build:** Semantic landmarks, labels, focus states, skip links, keyboard workflows, chart summaries, contrast fixes and reduced-motion handling.

**Learn:** WCAG-oriented development and assistive-technology testing.

**Areas:** Complete React application.

**Dependencies:** Phase 49.

**Verification:** axe checks, keyboard-only walkthrough and screen-reader smoke test.

**Completion:** No serious automated accessibility violations and all main workflows are keyboard-operable.

**Commit:** `fix(a11y): improve accessible navigation and analytics`

**Execution:** planning then implementation.

---

## Phase 51: Improve Mobile and Tablet Layouts

**Goal:** Make the product usable on smaller screens without hiding important risk information.

**Build:** Responsive dashboard grids, table alternatives, mobile navigation, touch-friendly controls and chart resizing.

**Learn:** Responsive data-heavy design.

**Areas:** Layout, dashboard, transactions, holdings, imports and scenarios.

**Dependencies:** Phase 49.

**Verification:** Browser device matrix and Playwright viewport tests.

**Completion:** Main workflows remain usable on common mobile and tablet widths.

**Commit:** `feat(web): add responsive portfolio layouts`

**Execution:** planning then implementation.

---

## Phase 52: Improve Onboarding and Demo Guidance

**Goal:** Help a first-time visitor understand and use Quantora without documentation.

**Build:** Guided demo entry, first-portfolio guidance, sample CSV prompt, contextual help and methodology introductions.

**Learn:** Product onboarding and progressive disclosure.

**Areas:** Landing page, demo mode, portfolio creation and empty states.

**Dependencies:** Phases 49 to 51.

**Verification:** First-time user walkthrough with no verbal assistance.

**Completion:** A reviewer can reach the first analysis quickly and understands that the data is synthetic.

**Commit:** `feat(web): improve onboarding and demo guidance`

**Execution:** planning then implementation.

---

# Week 14: Observability and Performance

## Phase 53: Expand Operational Dashboards and Alerts

**Goal:** Create useful operational views rather than merely collecting telemetry.

**Build:** Analysis success rate, job duration, provider failure, provider quota, API latency and worker backlog dashboards.

**Learn:** Service-level indicators and actionable alerting.

**Areas:** Application Insights, Bicep monitoring module and runbooks.

**Dependencies:** Phase 45.

**Verification:** Trigger representative failures and confirm dashboard and alert behaviour.

**Completion:** Important operational failures can be noticed and diagnosed quickly.

**Commit:** `feat(observability): add operational dashboards and alerts`

**Execution:** planning then implementation.

---

## Phase 54: Profile Application Performance

**Goal:** Measure bottlenecks before optimising.

**Build:** Repeatable load scenarios, query timing, task timing, frontend bundle analysis and baseline report.

**Learn:** Profiling and evidence-based optimisation.

**Areas:** Django, PostgreSQL, FastAPI, Celery and React.

**Dependencies:** Phase 53.

**Verification:** Baseline measurements are reproducible.

**Completion:** The highest-cost operations are identified with evidence.

**Commit:** `perf: establish Quantora performance baselines`

**Execution:** planning then implementation.

---

## Phase 55: Optimise Database and Cache Behaviour

**Goal:** Reduce measured backend latency and repeated work.

**Build:** Query optimisation, indexes, controlled `select_related` or `prefetch_related`, cache-key review and TTL tuning.

**Learn:** Query plans, index tradeoffs and cache invalidation.

**Areas:** Django selectors, PostgreSQL migrations and Redis caching.

**Dependencies:** Phase 54.

**Verification:** Compare before-and-after query counts and timings.

**Completion:** Improvements are measurable and no correctness test regresses.

**Commit:** `perf(api): optimise portfolio queries and caching`

**Execution:** planning then implementation.

---

## Phase 56: Optimise Jobs and Resilience

**Goal:** Improve worker throughput and recovery without violating provider quotas.

**Build:** Queue tuning, concurrency limits, prefetch settings, stuck-job detection and controlled failure drills.

**Learn:** Queue performance, backpressure and resilience testing.

**Areas:** Celery configuration, Redis, worker deployment and runbooks.

**Dependencies:** Phases 54 and 55.

**Verification:** Load test, worker restart test and provider-throttle test.

**Completion:** Jobs recover predictably and measured throughput improves safely.

**Commit:** `perf(jobs): improve worker throughput and recovery`

**Execution:** planning then implementation.

---

# Week 15: V1.5 Product Enhancements

## Phase 57: Add Analysis History Comparison

**Goal:** Let users compare two completed portfolio analyses.

**Build:** Analysis-history page, date selection, metric differences and safe comparison explanations.

**Learn:** Snapshot comparison and change visualization.

**Areas:** Django analysis APIs and React history views.

**Dependencies:** Immutable result model from Phase 36.

**Verification:** Compare valid runs, changed holdings and incompatible periods.

**Completion:** Users can understand how tracked metrics changed without receiving recommendations.

**Commit:** `feat(analysis): compare historical analysis runs`

**Execution:** planning then implementation.

---

## Phase 58: Add User-Owned CSV Exports

**Goal:** Let users export their own portfolios, transactions, holdings and analysis results.

**Build:** Export endpoints, streamed CSV files and export audit metadata.

**Learn:** Streaming responses and safe data export.

**Areas:** Django export services and React download controls.

**Dependencies:** Phase 36.

**Verification:** Ownership tests, escaping tests and large export test.

**Completion:** Exports contain user-owned derived data but no raw provider redistribution.

**Commit:** `feat(exports): add portfolio and analysis CSV downloads`

**Execution:** planning then implementation.

---

## Phase 59: Generate a Downloadable Risk Summary

**Goal:** Produce a polished report of a completed analysis.

**Build:** A versioned HTML or PDF report containing methodology references, disclaimers, provenance, and charts produced from the same Apache ECharts chart definitions or exported ECharts assets used by the React interface. Do not introduce a second general-purpose charting library for report generation.

**Learn:** Report generation and print-oriented layouts.

**Areas:** Report service, templates, storage policy and tests.

**Dependencies:** Phases 36, 39 and 58.

**Verification:** Snapshot testing, missing-metric cases and disclaimer check.

**Completion:** A user can download a self-contained educational analytics summary.

**Commit:** `feat(reports): generate portfolio risk summaries`

**Execution:** planning then implementation.

---

## Phase 60: Add Read-Only Demo Snapshots

**Goal:** Let portfolio reviewers open a stable demonstration without creating an account.

**Build:** Public synthetic snapshot routes, non-editable dashboard and shareable demo URLs.

**Learn:** Public read models and abuse-safe sharing.

**Areas:** Django demo endpoints, React read-only routes and throttling.

**Dependencies:** Phase 40.

**Verification:** No personal user data is exposed; mutation endpoints remain unavailable.

**Completion:** A recruiter can explore a representative synthetic analysis immediately.

**Commit:** `feat(demo): add shareable read-only analysis snapshots`

**Execution:** planning then implementation.

---

# Week 16: Case Study and Public Launch

## Phase 61: Write the Engineering Case Study

**Goal:** Explain the problem, architecture, decisions, implementation journey and measured outcomes.

**Build:** Long-form case study with product reasoning, diagrams, failures, tradeoffs and lessons.

**Learn:** Engineering communication and reflective practice.

**Areas:** `docs/case-study/` and portfolio website content.

**Dependencies:** Complete project.

**Verification:** Every technical claim links to code or documentation.

**Completion:** The case study works for both recruiters and engineers.

**Commit:** `docs: publish Quantora engineering case study`

**Execution:** planning and review primarily; implementation for repository integration.

---

## Phase 62: Produce Screenshots and Demo Video

**Goal:** Create clear visual evidence of the working product.

**Build:** Final screenshots, five-minute demo, shorter portfolio clip, captions and narration script.

**Learn:** Technical product demonstration.

**Areas:** Demo environment and launch assets.

**Dependencies:** Phases 49 to 60 where selected.

**Verification:** Demo follows a repeatable seeded workflow and contains no private data.

**Completion:** High-quality visuals show the product and engineering depth.

**Commit:** `docs: add final product demonstration assets`

**Execution:** planning and review for scripts; implementation only for adding repository assets and links.

---

## Phase 63: Create the Architecture and Interview Pack

**Goal:** Prepare to explain Quantora under interview questioning.

**Build:** System context, container, component and sequence diagrams; tradeoff questions; failure scenarios; calculation explanations; concise project pitch.

**Learn:** Architecture interviews and system-design communication.

**Areas:** `docs/architecture/` and private interview notes.

**Dependencies:** Complete implementation.

**Verification:** Rehearse explanations without reading code.

**Completion:** You can explain every service, data flow, risk metric and rejected alternative.

**Commit:** `docs: complete architecture and interview guide`

**Execution:** planning and review emphasis.

---

## Phase 64: Publish Launch Materials

**Goal:** Present Quantora consistently across GitHub, CV, LinkedIn and personal portfolio.

**Build:** CV bullets, project description, repository topics, release notes, LinkedIn post, portfolio page and final public checklist.

**Learn:** Honest technical positioning and career storytelling.

**Areas:** Public profiles and repository metadata.

**Dependencies:** Phases 61 to 63.

**Verification:** Every claim is demonstrably true and no wording suggests investment advice.

**Completion:** Quantora is publicly launched as a polished portfolio project.

**Commit:** `release: publish Quantora portfolio launch`

**Execution:** planning and review for writing and claim verification; implementation for repository metadata.

---

# 5. Compact 12-Week Overview

| Week |   Phases | Main outcome                                                            | Milestone                     |
| ---- | -------: | ----------------------------------------------------------------------- | ----------------------------- |
| 1    |   1 to 4 | Repository, documentation, toolchains, Django and React skeletons       | Repository foundation         |
| 2    |   5 to 8 | Docker Compose, authentication, portfolio creation                      | First local vertical slice    |
| 3    |  9 to 12 | Portfolio isolation, production images, initial Bicep and Azure         | First Azure deployment        |
| 4    | 13 to 16 | Asset and transaction domain, manual transactions, cost basis           | Transaction ledger works      |
| 5    | 17 to 20 | Holdings and atomic CSV imports                                         | Portfolio construction works  |
| 6    | 21 to 24 | Market-data contracts, fixtures, Twelve Data and Django integration     | First FastAPI integration     |
| 7    | 25 to 28 | Celery, async imports, async refresh and Alpha Vantage fallback         | First async workflow          |
| 8    | 29 to 32 | Risk engine, valuation, returns, volatility, drawdown and concentration | First deterministic analytics |
| 9    | 33 to 36 | Benchmark, scenario, orchestration and result persistence               | First end-to-end analysis     |
| 10   | 37 to 40 | Dashboards, explanations, scenarios and synthetic demo                  | Local V1 complete             |
| 11   | 41 to 44 | Full Azure topology, OIDC CI/CD and cloud acceptance                    | MVP complete                  |
| 12   | 45 to 48 | Observability, security, tests and public documentation                 | Strong portfolio version      |

---

# 6. Main Risks by Week

## Week 1

**Risk:** Overdesigning repository structure before writing code.

**Mitigation:** Create only the locked service directories and documents. Do not add speculative packages.

## Week 2

**Risk:** Session authentication and CSRF confusion.

**Mitigation:** Implement and test the CSRF bootstrap pattern before building product features. Do not bypass CSRF to make development easier.

## Week 3

**Risk:** Azure deployment consuming the whole week.

**Mitigation:** Deploy only the thin slice. Do not provision Redis, workers or FastAPI services yet.

## Week 4

**Risk:** Incorrect transaction and average-cost rules.

**Mitigation:** Use pure Decimal-based functions and manually verified examples before adding UI complexity.

## Week 5

**Risk:** CSV import becoming a general spreadsheet platform.

**Mitigation:** Support exactly one documented schema. Reject rather than guess ambiguous input.

## Week 6

**Risk:** Provider-specific fields leaking into Django.

**Mitigation:** Require every adapter to return the shared Pydantic contracts.

## Week 7

**Risk:** Duplicate Celery execution or provider overuse.

**Mitigation:** Implement idempotency, locks, quotas and bounded retries before increasing worker concurrency.

## Week 8

**Risk:** Mathematical errors hidden behind attractive output.

**Mitigation:** Use small hand-calculated fixtures, pure functions and methodology documents.

## Week 9

**Risk:** Historical holdings and returns constructed incorrectly.

**Mitigation:** Test trades occurring inside the analysis period and enforce the next-trading-day contribution rule.

## Week 10

**Risk:** Dashboard language becoming advisory.

**Mitigation:** Use approved deterministic templates and automated forbidden-word checks.

## Week 11

**Risk:** Cloud cost and deployment complexity.

**Mitigation:** Set low scaling maxima, development-sized services, clear budgets and one controlled environment before production.

## Week 12

**Risk:** Rushing documentation and testing because the application appears finished.

**Mitigation:** Treat Phases 45 to 48 as release requirements rather than optional cleanup.

---

# 7. Earliest CV and Deployment Points

## Earliest honest CV inclusion

**After Phase 12, at the end of Week 3.**

At that point, it may appear as:

> Building Quantora, a cloud-hosted React and Django portfolio analytics platform deployed to Azure using Docker and Bicep.

It must be labelled as under development. Do not yet claim microservices, asynchronous analytics or risk calculations.

## Earliest technically meaningful CV version

**After Phase 28, at the end of Week 7.**

At that point, Quantora demonstrates:

* React
* Django REST Framework
* PostgreSQL
* FastAPI
* Provider abstraction
* Redis
* Celery
* Background jobs
* Docker Compose
* Early Azure deployment
* Testing

The product is still incomplete, but the engineering story is substantial.

## Earliest strong interview demonstration

**After Phase 36, at the end of Week 9.**

This is the first point where Quantora genuinely performs end-to-end portfolio risk analysis.

## Earliest public deployment

**Technically: Phase 12, Week 3.**

This should be treated as a development or staging deployment.

## Earliest meaningful public product deployment

**Phase 44, Week 11.**

This is the first point where the full V1 system, synthetic demo, cloud infrastructure and CI/CD are accepted together.

## Recruiter-ready public version

**Phase 48, Week 12.**

---

# 8. Definition of MVP Complete

Quantora MVP is complete only when:

* Registration, login, session restoration and logout work.
* Users cannot access another user's data.
* Users can create multiple portfolios.
* Users can add, edit and delete buy and sell transactions.
* Negative long-only positions are prevented.
* CSV transaction imports are previewed and committed atomically.
* Large imports can run asynchronously.
* Holdings are derived from transactions.
* Weighted-average estimated cost basis is calculated.
* Fixture, Twelve Data and Alpha Vantage adapters exist.
* Automated tests use no live provider.
* Market refresh runs asynchronously.
* Freshness, provenance, fallback and stale state are visible.
* Portfolio value and allocation work.
* Estimated unrealised P/L works.
* Daily portfolio returns work.
* Annualised volatility works.
* Maximum drawdown works.
* Concentration measurements work.
* The benchmark-comparison workflow works with actual SPY data in provider-enabled private development where permitted, deterministic fixture benchmark data in automated tests, and a clearly labelled fictional broad-market benchmark in the public synthetic demo.
* Synthetic benchmark data is never labelled as SPY, and the same date-alignment, cumulative-return, comparison, provenance, freshness, and sufficiency logic is used for both real and synthetic benchmark inputs.
* Static price-shock scenarios work.
* Neutral deterministic explanations work.
* Methodology, assumptions and limitations are visible.
* Analysis status polling works.
* Synthetic public-demo mode works.
* React calls only Django.
* Both FastAPI services remain private.
* PostgreSQL is the durable source of truth.
* Redis is used only for temporary and coordination responsibilities.
* The complete system is deployed to Azure.
* Bicep describes the infrastructure.
* GitHub Actions performs validated CI/CD.
* Baseline Application Insights telemetry is available.
* The complete V1 cloud acceptance workflow passes.

**MVP complete milestone: Phase 44.**

---

# 9. Definition of Strong Portfolio Version Complete

The strong portfolio version requires everything in MVP plus:

* Distributed OpenTelemetry traces
* Structured and redacted logs
* Operational dashboards
* Security and abuse-control review
* Authentication and analysis throttling
* Complete user-isolation audit
* Dependency, container and secret scanning
* Strong risk-engine calculation coverage
* Provider contract tests
* Failure-injection tests
* Playwright demonstration workflow
* Fresh-clone local setup verification
* Accurate architecture diagrams
* Complete ADRs
* Calculation methodology documentation
* Testing documentation
* Security documentation
* Deployment and operations documentation
* Honest known limitations
* Screenshots
* Five-minute demo workflow
* Interview-ready architecture explanations
* Apache ECharts is the only installed general-purpose charting library.
* Allocation, cumulative-return, benchmark-comparison, drawdown, and scenario visualisations use reusable Apache ECharts components.
* Chart data is produced by the server and remains consistent with accessible tables or text summaries.
* The public demonstration clearly labels its fictional broad-market benchmark as synthetic.
* No public-demo page or documentation claims that synthetic benchmark data represents actual SPY prices.
* No assistant-specific files or traces in the repository
* A tagged and publicly presentable release

**Strong portfolio version milestone: Phase 48.**

---

# 10. Final Direction

The 48 phases should be treated as a dependency chain, not as 48 isolated feature tickets.

Each phase must end with:

1. Working code or completed documentation
2. Passing tests
3. A manual understanding check
4. Updated relevant documentation
5. A focused diff review
6. One meaningful Git commit

Do not begin the next phase when the current completion criteria are only partially satisfied. If one phase becomes too large, split it internally into learning and implementation sessions, but do not pull features forward from later phases.

The project should remain deliberately narrow:

* End-of-day
* USD
* US-listed equities and ETFs
* Long-only
* Transaction-based
* One source-independent benchmark-comparison workflow, using actual SPY only in provider-enabled private development where provider terms permit it, deterministic fixture benchmark data in automated tests, and a clearly labelled fictional broad-market benchmark in the public synthetic demo
* One scenario model
* Two private FastAPI services
* One public Django API
* Deterministic explanations
* No advice or prediction
* Apache ECharts is Quantora's only general-purpose charting library and is used for allocation, cumulative-return, benchmark, drawdown, scenario, treemap, and future heatmap visualisations.

Finishing this exact version with strong tests, Azure deployment and clear engineering explanations will produce substantially more portfolio value than expanding the financial feature list.
