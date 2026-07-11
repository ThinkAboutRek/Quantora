# Security Policy

Quantora handles user-owned portfolio data and integrates with third-party
market-data providers. Security is a first-class concern across the application
and its service boundaries.

---

## Reporting a vulnerability

If you discover a security vulnerability in Quantora, please report it
privately rather than opening a public issue.

* **How to report:** email the maintainers with a clear description, the
  affected component, and reproduction steps. Include the potential impact and,
  where possible, a suggested remediation.
* **Please do not** publicly disclose the issue, exploit it beyond what is
  necessary to demonstrate it, or access, modify, or exfiltrate data that is not
  your own.
* **What to expect:** we will acknowledge your report, investigate, and keep you
  informed of remediation progress. Please allow reasonable time for a fix
  before any public disclosure.

### In scope

* The Django public API (authentication, authorisation, user and portfolio
  isolation, input validation, rate limiting).
* The React application (session handling, CSRF, cross-origin behaviour).
* Handling of secrets and provider credentials.
* Service-boundary controls between Django, the private FastAPI services, and
  the Celery worker.

### Out of scope

* Denial-of-service testing against any hosted environment.
* Findings that require a compromised host, physical access, or social
  engineering.
* Third-party market-data providers' own infrastructure.

---

## Core security principles

Quantora's design follows these principles (see
[ADR 003 — Service Boundaries](docs/adr/0003-service-boundaries.md) for detail):

* **Authentication:** Django session authentication with secure, HttpOnly
  cookies. CSRF protection is required for every state-changing request.
* **CORS:** exact-origin, credentialed CORS. No wildcard credentialed origins.
* **Secrets stay out of the repository:** local development uses environment
  variables (`.env`, never committed); Azure uses Key Vault references. Only the
  placeholder `.env.example` is tracked.
* **Private internal services:** the market-data and risk-engine FastAPI
  services use internal ingress only and are never reachable from the browser.
  Provider keys remain inside the market-data service; React never receives one.
* **No secrets in logs or images:** logs redact credentials, tokens, and
  sensitive headers. Provider errors never expose raw secrets. Images contain no
  `.env` files, Git history, or test secrets.
* **Least privilege:** database credentials use the minimum required
  permissions; public rate limiting is applied at Django and provider-quota
  limiting in the market-data workflow.
* **Hardened runtime (later phases):** production containers run as non-root
  users.
* **No provider data in version control:** provider responses, licensed or
  downloaded market data, and secret-bearing test cassettes are never committed
  (see [ADR 001](docs/adr/0001-market-data-strategy.md)).

---

## Threat model

A fuller threat model — covering authentication, file uploads, provider
integration, background jobs, and service boundaries — is planned in
`docs/security/` in a later phase. This document will be updated with a link
when that material is published.
