# Quantora Documentation

This directory holds Quantora's product and engineering documentation. It is the
authoritative description of what Quantora is, why it is built the way it is, and
how it will be delivered.

New reviewers can understand Quantora's purpose, V1 scope, architecture, and
non-goals from these documents without reading source code. Start with the
[Product Charter](product/product-charter.md).

---

## Available now

### Product

* [Product Charter](product/product-charter.md) — the authoritative V1 product
  definition: purpose, users, scope, metrics, non-goals, and safe-finance
  positioning.

### Architecture decisions

* [ADR index](adr/README.md) — what ADRs are and the accepted decisions.
  * [ADR 001 — Market Data Strategy](adr/0001-market-data-strategy.md)
  * [ADR 002 — Asynchronous Job Strategy](adr/0002-asynchronous-job-strategy.md)
  * [ADR 003 — Service Boundaries](adr/0003-service-boundaries.md)

### Planning

* [Roadmap](roadmap.md) — the locked, phased delivery plan, with the roadmap
  corrections applied directly into the text.
* [Roadmap corrections](roadmap-corrections.md) — the verbatim amendment record
  that governs the roadmap where the two differ.

### Reference

* [Glossary](glossary.md) — financial and architectural terms used throughout
  the documentation.

### Operations

* [Local development with Docker Compose](operations/local-development.md) —
  running the full four-service stack (API, frontend, PostgreSQL, Redis) locally.
* [Production container images](operations/containers.md) — the deployable
  Django API image and React static bundle: multi-stage builds, pinned base
  images, the runtime environment contract, and the local verification harness.
* [Azure foundation (Bicep thin-slice environment)](operations/azure-foundation.md) —
  the initial subscription-scoped Bicep infrastructure: module and resource map,
  naming and tags, secure parameters, the workload-profiles Container Apps
  environment, cost assumptions, and the operator deployment steps.

---

## Planned (future phases)

The following documentation areas are planned and will be added as the
corresponding roadmap phases are implemented. They do not exist yet, so they are
intentionally **not** linked here:

* **Architecture** — domain model, background-jobs design, Azure topology, and
  system diagrams.
* **Methodology** — the precise definition, formula, assumptions, and
  limitations of each risk metric (valuation, returns and volatility, drawdown,
  concentration, benchmark comparison, cost basis, scenario analysis).
* **Security** — the full threat model and security hardening notes.
* **Testing** — the testing strategy, coverage targets, and failure-injection
  suite.
* **Operations** — container, deployment, observability, and release
  documentation. (Local development is published above.)

This index will be updated to link each area as it is published.
