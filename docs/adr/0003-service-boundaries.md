# ADR 003: Service Boundaries

## ADR status

**Accepted**

## Architectural principle

Django is the only public application API in V1.

React never calls a FastAPI service directly.

The two FastAPI services are private, stateless computational or integration services.

PostgreSQL is the durable source of truth.

Redis provides temporary coordination, queueing, caching, locks, and limits.

---

## Final V1 topology

```text
Browser
   |
   v
React application
   |
   v
Django REST Framework API
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
```

React is deployed through Azure Static Web Apps.

Django, both FastAPI services, the Celery worker, and Celery Beat are deployed through Azure Container Apps.

FastAPI services use internal ingress only.

The worker has no ingress.

---

## 1. React frontend

### Owns

* User interface
* Routing
* Forms
* Client-side input feedback
* Accessible charts and tables
* Dashboard composition
* Authentication user experience
* Analysis progress polling
* Display formatting
* Data-freshness warnings
* Methodology presentation
* Disclaimer presentation
* Loading, empty, stale, unavailable, and error states

### Does not own

* Financial formulas
* Provider API calls
* Authoritative validation
* Portfolio permission decisions
* Transaction-derived holdings
* Final risk classifications
* Job execution
* Persistent job state
* Provider fallback logic

### Rules

* React calls Django only.
* React treats all financial values as server-produced results.
* Client-side calculations are limited to visual formatting.
* Chart transformations must not change authoritative results.
* Every risk card can link to its methodology.
* Every market-dependent page shows the data as-of date.

---

## 2. Django REST Framework backend

### Owns

* Public API
* Authentication
* Authorisation
* User and portfolio isolation
* Portfolio CRUD
* Transaction CRUD
* CSV upload workflow
* CSV validation orchestration
* Asset records and canonical identifiers
* Derived holding persistence or read models
* Analysis-run creation
* Job status endpoints
* Scenario-run creation
* Results API
* Public API versioning
* Public request validation
* Application rate limiting
* Audit-relevant events
* Final persistence
* OpenAPI documentation
* Mapping deterministic result reason codes to neutral explanatory text

### Does not own

* Vendor-specific market-data parsing
* Direct provider response shapes
* Statistical calculation implementation
* Long-running work inside HTTP requests
* Public market-data redistribution
* Generative financial commentary

### Key rule

Only Django writes product-domain results to PostgreSQL.

FastAPI services do not directly persist portfolios, transactions, analysis runs, or user-facing metric records.

This preserves clear data ownership.

---

## 3. Market-data FastAPI service

### Purpose

Provide a private anti-corruption layer between Quantora and market-data vendors.

### Owns

* Provider adapters
* Provider authentication
* Provider request construction
* Provider timeouts
* Provider error classification
* Provider rate-limit interpretation
* Provider response validation
* Symbol normalization
* Asset search normalization
* Historical-price normalization
* Corporate-action adjustment field mapping
* Provider health checks
* Provider-specific caching
* Fixture provider
* Normalized Pydantic contracts

### Does not own

* User accounts
* Portfolios
* Transactions
* Holdings
* Risk calculations
* Analysis-run status
* Long-term domain persistence
* Public HTTP access
* Investment insights

### Inputs

* Symbol or search query
* Date range
* Requested data type
* Correlation ID
* Provider selection or policy

### Outputs

* Normalized asset metadata
* Normalized end-of-day bars
* Provider and freshness metadata
* Typed provider error

### Database access

The market-data service does not write directly to PostgreSQL in V1.

The background worker receives its normalized response and persists accepted records through Django domain code.

This prevents shared database ownership.

---

## 4. Risk-engine FastAPI service

### Purpose

Perform deterministic, versioned financial calculations.

### Owns

* Portfolio value calculations
* Allocation calculations
* Estimated unrealised profit or loss
* Asset daily-return calculations
* Portfolio daily-return calculations
* Annualised volatility
* Maximum drawdown
* Concentration measurements
* Benchmark comparison
* Simple price-shock scenario calculation
* Data-sufficiency rules
* Numeric validation
* Formula versioning
* Metric reason codes
* Calculation metadata
* Pure calculation tests

### Does not own

* Users
* Authentication
* Portfolio permissions
* Provider APIs
* Asset search
* Market-data fetching
* Database writes
* Job orchestration
* Financial recommendations
* Natural-language advice
* UI wording
* Persistent caching

### Design rules

The risk engine is stateless.

For identical:

* Input data
* Configuration
* Contract version
* Formula version

it must return identical results.

Inputs and outputs are validated with Pydantic.

The service returns machine-readable results such as:

```text
metric_code
value
unit
period_start
period_end
observation_count
formula_version
status
reason_code
warnings
```

It does not return statements such as “high risk” or “you should diversify.”

---

## 5. Background worker

### Purpose

Orchestrate long-running workflows.

### Owns

* Consuming Celery messages
* Updating analysis state
* Acquiring distributed locks
* Checking stored data freshness
* Calling the market-data service
* Persisting accepted market data
* Building risk-engine inputs
* Calling the risk engine
* Persisting metric results
* Applying retry policy
* Applying idempotency policy
* Updating progress
* Recording safe failure details
* Sending completion notifications when added

### Does not own

* Public endpoints
* User-interface presentation
* Independent financial formulas
* Provider-specific parsing
* Permanent data outside PostgreSQL

### Key rule

The worker is an orchestrator, not a third business-logic implementation.

Shared Django domain services are reused by:

* Django request handlers
* Celery tasks
* Management commands
* Test setup

---

## 6. PostgreSQL

### Purpose

Durable source of truth.

### Owns

* Users
* Portfolios
* Transactions
* Assets
* Provider symbol mappings
* Historical prices
* Derived holdings or holding snapshots
* Analysis runs
* Metric results
* Scenario runs
* Scenario results
* Provider sync state
* Data provenance
* Import records
* Audit timestamps
* Formula and contract versions used for each result

### Rules

* Monetary and quantity values use decimal types.
* Percentage and statistical values use explicitly documented precision.
* Timestamps are stored in UTC.
* Trading dates are stored as dates.
* Historical data has uniqueness constraints.
* User-owned records include ownership checks.
* Results are immutable after successful completion, except through an explicit versioned recalculation.
* Deleting a portfolio follows a documented retention policy.

---

## 7. Redis

### Purpose

Temporary high-speed infrastructure.

### Owns

* Celery broker queues
* Cache entries
* Distributed locks
* Rate-limit counters
* Provider quota counters
* Short-lived progress values
* Duplicate-work prevention
* Temporary provider health markers

### Does not own

* Permanent results
* Permanent prices
* User portfolios
* Transaction history
* Final audit state

### Key prefixes

```text
celery:
cache:asset-search:
cache:asset:
cache:price:
lock:market-refresh:
lock:analysis:
rate:user:
rate:provider:
progress:analysis:
idempotency:
```

Loss or clearing of Redis may interrupt active jobs, but it must not destroy completed business data.

---

## 8. Communication rules

### Browser to Django

* HTTPS
* Versioned REST endpoints
* JSON
* CSV upload where applicable

### Django to worker

* Celery message containing identifiers and small parameters
* No large historical series in queue messages

### Worker to market-data service

* Private HTTP
* JSON
* Pydantic-validated contract
* Correlation ID
* Explicit timeout
* Service authentication or private network restrictions

### Worker to risk-engine service

* Private HTTP
* JSON
* Pydantic-validated contract
* Versioned analysis request
* Explicit timeout

### FastAPI to browser

Forbidden in V1.

### FastAPI to product database

Forbidden in V1.

---

## 9. Service contract versioning

Internal service endpoints begin at:

```text
/internal/v1/
```

Contracts include a schema version.

Breaking changes require:

* A new contract version
* Compatibility tests
* Worker updates
* Deployment ordering documentation

The worker validates the expected service version at startup or through health checks.

---

## 10. Insights boundary

There is no separate insight microservice in V1.

The risk engine returns:

* Metric values
* Formula metadata
* Warnings
* Reason codes
* Data-sufficiency states

Django converts these into approved neutral templates.

React presents them.

This provides explainability without:

* A third FastAPI service
* LLM complexity
* Uncontrolled wording
* Recommendation risk
* Additional deployment overhead

A dedicated insight service is not planned until there is a clear need that cannot be handled through deterministic templates.

---

## 11. Security boundaries

* Only Django has external application ingress.
* FastAPI services are private.
* Provider keys remain inside the market-data service.
* React never receives a provider key.
* Worker messages contain IDs rather than sensitive payloads.
* Django performs all user authorisation.
* FastAPI services trust only requests from the private environment and still validate every payload.
* Secrets are loaded from environment references backed by Azure Key Vault.
* Logs redact credentials, tokens, and sensitive headers.
* Database credentials use the minimum required permissions.
* Public rate limiting is applied at Django.
* Provider quota limiting is applied in the market-data workflow.

---

## 12. Deployment ownership

### Azure Static Web Apps

* React application
* Static assets
* Frontend environment configuration

### Azure Container Apps

* Django API
* Market-data FastAPI service
* Risk-engine FastAPI service
* Celery worker
* Celery Beat

### Azure Database for PostgreSQL

* Durable relational data

### Azure Managed Redis

* Celery broker
* Cache
* Locks
* Rate limits
* Progress acceleration

### Azure Container Registry

* Django and worker image
* Market-data service image
* Risk-engine service image

### Azure Key Vault

* Django secret
* Database credentials where managed identity cannot replace them
* Redis credentials
* Provider keys
* Application Insights configuration
* Service authentication secrets

### Azure Application Insights

* Request traces
* Dependency traces
* Exceptions
* Service latency
* Correlation across Django, worker, and FastAPI services

---

## Consequences

### Positive

* Public attack surface is limited.
* Django remains the clear application owner.
* FastAPI services have genuine, defensible boundaries.
* Risk calculations remain isolated and testable.
* Provider integration can change independently.
* Database ownership remains clear.
* Asynchronous orchestration becomes visible and meaningful.
* The architecture demonstrates microservices without creating unnecessary services.

### Negative

* Internal HTTP adds latency and failure modes.
* Distributed tracing becomes necessary.
* Contract compatibility must be managed.
* Local development contains several containers.
* Deployment and debugging are more complex than a monolith.

These costs are accepted because each service has a distinct responsibility and demonstrates a real engineering boundary.

---
