# Architecture Decision Records (ADRs)

An **Architecture Decision Record** captures a single significant architectural
decision: its context, the decision itself, and its consequences. ADRs make the
reasoning behind Quantora's design explicit and durable, so that reviewers and
future contributors can understand *why* a choice was made — not just *what* was
built — and can revisit a decision deliberately rather than by accident.

Quantora records decisions as ADRs because the architecture spans several
services and integrations where the trade-offs (and the rejected alternatives)
matter as much as the outcome.

---

## Accepted ADRs

| ADR | Title | Status |
| --- | --- | --- |
| [ADR 001](0001-market-data-strategy.md) | Market Data Strategy | **Accepted** |
| [ADR 002](0002-asynchronous-job-strategy.md) | Asynchronous Job Strategy | **Accepted** |
| [ADR 003](0003-service-boundaries.md) | Service Boundaries | **Accepted** |

* **ADR 001 — Market Data Strategy:** provider selection (Twelve Data primary,
  Alpha Vantage secondary), the deterministic fixture provider, synthetic public
  demo data, provider abstraction and fallback, PostgreSQL and Redis storage
  responsibilities, and testing without live APIs.
* **ADR 002 — Asynchronous Job Strategy:** Celery with a Redis broker,
  PostgreSQL as the canonical job-state store, retry and idempotency strategy,
  and the local and Azure deployment topologies.
* **ADR 003 — Service Boundaries:** Django as the only public API, the two
  private FastAPI services, the Celery worker as orchestrator, and the ownership
  rules for PostgreSQL and Redis.

---

## Relationship to the roadmap

Where the [roadmap corrections](../roadmap-corrections.md) and the
[roadmap](../roadmap.md) refine implementation detail, those corrections govern
the roadmap. The ADRs remain the record of the accepted architectural
decisions; a future decision that supersedes one of them would be captured as a
new accepted ADR rather than by editing history.
