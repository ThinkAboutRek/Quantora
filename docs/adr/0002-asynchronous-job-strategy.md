# ADR 002: Asynchronous Job Strategy

## ADR status

**Accepted**

## Decision

Quantora uses:

* **Celery** as the asynchronous task framework
* **Redis** as the Celery broker
* A dedicated **Celery worker**
* A single **Celery Beat** scheduler for periodic tasks
* PostgreSQL `AnalysisRun` records as the canonical job-state store

The same architecture is used locally and in Azure.

Quantora does not use Dramatiq, RQ, Django-Q, or Azure Container Apps Jobs as its primary V1 job system.

---

## Why Celery

Celery is selected because it provides:

* Mature Django integration
* Task retries
* Retry backoff
* Task routing
* Time limits
* Scheduled work
* Worker concurrency
* Task acknowledgements
* Broad operational documentation
* Strong recognition in Python backend roles

Celery's documentation specifically recommends idempotent tasks where redelivery is possible and supports automatic retry with exponential backoff and jitter.

Celery introduces more configuration than RQ or Dramatiq, but this project benefits from demonstrating explicit retry, idempotency, routing, and worker-operating decisions.

---

## Rejected alternatives

### RQ

Rejected because it is simpler but provides a less substantial demonstration of task routing, retry policy, scheduling, and production worker design.

### Dramatiq

Rejected because it is capable and clean, but Celery has stronger Django ecosystem familiarity and better aligns with the project's CV goal.

### Django-Q

Rejected because it provides less value than Celery for a project intended to demonstrate broadly recognisable Python production patterns.

### Azure Container Apps Jobs

Rejected as the primary application job mechanism.

Azure Container Apps Jobs supports manual, scheduled, and event-driven container executions, but Quantora needs one portable queue model for user-triggered jobs, local development, progress tracking, retry behaviour, and application-level orchestration.

Container Apps Jobs may be evaluated after V1 for isolated maintenance operations, database migrations, or large administrative backfills. They are not part of the locked V1 application workflow.

---

## Tasks that run asynchronously

### Market-data refresh

For the assets needed by a portfolio:

* Acquire a distributed lock
* Check PostgreSQL freshness
* Check provider quotas
* Fetch missing data
* Validate normalized data
* Store new daily bars
* Update provider sync state
* Release the lock

### Portfolio analysis

* Load portfolio transactions
* Build historical quantities
* Load required market data
* Construct portfolio daily return series
* Call the risk-engine service
* Validate the response
* Store metric results
* Update analysis status

### Scenario analysis

* Validate scenario inputs
* Load current holdings and latest accepted prices
* Call the risk-engine scenario endpoint
* Save the scenario results
* Update scenario status

### Transaction CSV import

Small files may be validated synchronously, but database import is asynchronous when:

* The file exceeds the defined small-file threshold
* Asset resolution requires provider calls
* The import contains many rows

The same import service is used in both synchronous and asynchronous execution so behaviour does not diverge.

### Scheduled end-of-day refresh

Celery Beat enqueues refresh tasks for active provider-enabled portfolios once daily.

It does not fetch every supported asset. It refreshes only:

* Assets held by active portfolios
* The SPY benchmark
* Assets recently viewed where caching policy justifies it

### Maintenance

Asynchronous maintenance includes:

* Expired cache cleanup where needed
* Old progress-event cleanup
* Synthetic demo reset
* Provider health checks
* Stuck-job detection

---

## Tasks that remain synchronous

The following should normally complete within a web request:

* Authentication
* Creating a portfolio
* Renaming a portfolio
* Basic transaction CRUD
* Reading stored dashboards
* Reading completed metrics
* Reading analysis status
* Validating a small scenario request
* Asset search when a cached result exists

A web request must not wait for:

* A live provider history download
* Full portfolio time-series construction
* Risk calculations over long histories
* CSV import of a substantial file

---

## Local development deployment

Docker Compose runs:

```text
frontend
django-api
market-data-service
risk-engine-service
celery-worker
celery-beat
postgres
redis
```

The worker uses the Django application image with a different startup command.

This prevents unnecessary duplication between the web and worker codebases.

Example responsibility split:

```text
django-api:
    gunicorn quantora.wsgi

celery-worker:
    celery -A quantora worker

celery-beat:
    celery -A quantora beat
```

FastAPI services use separate images because they represent separate deployable service boundaries.

---

## Azure production deployment

Azure Container Apps runs separate applications for:

* Django API
* Market-data service
* Risk-engine service
* Celery worker
* Celery Beat

Configuration:

### Django API

* External ingress
* Minimum one replica for the portfolio version
* HTTP-based scaling
* Access to PostgreSQL, Redis, Key Vault, and private services

### Market-data service

* Internal ingress only
* No public endpoint
* Scale to zero may be enabled after cold-start behaviour is measured

### Risk-engine service

* Internal ingress only
* No public endpoint
* Scale to zero may be enabled after cold-start behaviour is measured

### Celery worker

* No ingress
* Minimum one replica in the first production version
* Maximum replicas initially limited to control provider quotas and costs
* Queue-length scaling may be added after the queue is stable

Azure Container Apps supports KEDA-based scaling and includes Redis among its supported custom event sources. It also allows a minimum replica count of zero or one depending on whether always-on processing is required.

### Celery Beat

* No ingress
* Exactly one replica
* Never horizontally scaled
* Protected against duplicate scheduling

---

## Job state model

PostgreSQL stores a first-class `AnalysisRun` model.

Suggested fields:

```text
id
user_id
portfolio_id
job_type
status
stage
progress_percent
celery_task_id
idempotency_key
input_version
input_hash
data_as_of_date
provider_name
fallback_used
attempt_count
queued_at
started_at
completed_at
failed_at
last_heartbeat_at
error_code
safe_error_message
internal_error_reference
result_version
created_at
updated_at
```

Statuses:

```text
QUEUED
RUNNING
RETRYING
SUCCEEDED
FAILED
```

Cancellation is not included in V1 because correct distributed cancellation adds complexity and can leave partial state.

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

PostgreSQL is canonical.

Redis may hold a faster progress copy, but loss of Redis must not erase the final job state.

---

## Failure storage

User-visible failure information contains:

* Safe error category
* Short neutral explanation
* Whether retry is possible
* Failure timestamp
* Correlation reference

Internal logs contain:

* Exception type
* Stack trace
* Provider response classification
* Request and correlation IDs
* Task ID
* Portfolio ID
* Service call timings

Raw provider keys, credentials, and sensitive headers are never stored in error messages.

---

## Retry strategy

### Retryable errors

* Provider HTTP 429
* Provider HTTP 500-series errors
* Network timeout
* Temporary DNS failure
* Temporary internal-service unavailability
* Redis connection interruption
* Database deadlock
* Other explicitly classified transient failures

Default:

* Maximum three retries
* Exponential backoff
* Jitter
* Provider-aware minimum delay
* Explicit connect and read timeouts

### Non-retryable errors

* Invalid symbol
* Invalid transaction history
* Negative resulting position
* Unsupported asset type
* Insufficient data
* Pydantic contract failure caused by an incompatible provider response
* Deterministic calculation error
* User permission failure

These fail immediately with a safe explanation.

---

## Idempotency strategy

Every asynchronous operation receives an idempotency key.

Example analysis key:

```text
portfolio_id
transaction_version
latest_required_price_date
benchmark
analysis_period
risk_engine_contract_version
```

The hash of those values becomes the idempotency key.

Rules:

* Only one active run for the same idempotency key is permitted.
* Repeated requests return the existing run.
* Historical prices use database upserts.
* Metric results have a unique run and metric identifier.
* Scenario runs use an input hash.
* A task may safely be executed more than once.
* External provider calls are minimized before retry.
* Database writes occur in bounded transactions.
* Partial results are not marked successful.

Tasks that are fully idempotent may use late acknowledgement so interrupted work can be redelivered safely. Celery warns that such tasks can run more than once and therefore must be designed accordingly.

---

## Worker timeouts and concurrency

V1 starts conservatively:

* Provider requests have explicit connection and read timeouts.
* Analysis tasks have soft and hard time limits.
* Worker prefetch is kept low for long tasks.
* Market-data task concurrency is limited to protect provider quotas.
* Risk calculations may use a separate queue from provider fetching.
* Large numeric payloads are not passed through Redis messages.

Celery messages contain identifiers, not full price histories.

The worker retrieves durable inputs from PostgreSQL and calls internal services.

Suggested queues:

```text
market-data
analysis
imports
maintenance
```

One worker can initially consume all queues. Separate workers are introduced only after measurements justify them.

---

## User progress experience

The Django endpoint that creates an analysis returns:

```text
HTTP 202 Accepted
analysis_run_id
status_url
```

React polls the Django status endpoint.

Polling behaviour:

* Every two seconds while queued or running
* Slower polling after a prolonged run
* Stop after success or failure
* Stop when the page is no longer active
* Resume when the user returns

V1 does not use WebSockets or Server-Sent Events.

Polling is easier to test, deploy, and explain, and is sufficient for analysis jobs lasting seconds rather than hours.

The interface shows:

* Current stage
* Approximate progress
* Elapsed time
* Data provider state
* Retry state
* Completion or failure message

---

## Consequences

### Positive

* Strong Django and Python ecosystem alignment
* Same model locally and in Azure
* Explicit retry and failure handling
* Visible asynchronous workflow
* Strong portfolio and interview value
* Clear separation between HTTP requests and expensive work

### Negative

* Celery configuration requires care.
* Redis broker behaviour must be understood.
* Beat requires a single scheduler instance.
* Tasks must be idempotent.
* Debugging crosses API, worker, broker, and private-service boundaries.

These costs are accepted because asynchronous orchestration is one of Quantora's core engineering demonstrations.

---
