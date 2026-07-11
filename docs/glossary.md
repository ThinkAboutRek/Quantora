# Glossary

Definitions of the financial and architectural terms used across Quantora's
documentation. Definitions are descriptive; they explain how Quantora uses each
term and are not investment advice.

---

## Financial terms

**End-of-day (EOD)**
Data taken as of the close of a completed trading day, rather than intraday or
real-time. Quantora is an end-of-day system: all prices and metrics reflect the
latest completed trading day, and the interface always shows the actual
market-data date.

**Adjusted close**
A closing price adjusted for corporate actions such as splits and dividends so
that a historical return series is comparable over time. Quantora's return
calculations use adjusted closing prices.

**Daily return**
The proportional change in value from one trading day to the next. Quantora
computes each asset's daily return from adjusted prices and builds a portfolio
daily return series using the previous trading day's holding weights, so that
buys and sells are not mistaken for investment performance.

**Annualised volatility**
The standard deviation of daily portfolio returns scaled to a yearly figure
using 252 trading days. Quantora reports it over a trailing period (by default
12 months, with a minimum of 30 observations) and marks it unavailable when
there is insufficient data rather than estimating from too few observations.

**Maximum drawdown**
The largest peak-to-trough decline in the cumulative portfolio return series
over the selected period. It describes a historical decline and is not a
prediction of future losses.

**Concentration / HHI**
Measures of how much of a portfolio is held in its largest positions. Quantora
presents the largest holding weight, the top-three holdings weight, and the
**Herfindahl-Hirschman Index (HHI)** — the sum of squared portfolio weights.
These are presented neutrally and do not classify a portfolio as safe or unsafe.

**Weighted-average cost basis**
An analytics convention that estimates the average acquisition cost of a holding
by weighting each purchase by its quantity. Quantora uses it to estimate
unrealised profit or loss. It is an analytics convention only — not a tax
calculation or official accounting treatment.

**Unrealised profit or loss (P/L)**
The estimated difference between a holding's current market value and its
weighted-average acquisition cost, for positions still held. It is "unrealised"
because the position has not been sold.

**Benchmark**
A reference return series a portfolio is compared against over an identical
period. Quantora uses one source-independent benchmark-comparison workflow:
actual SPY only in provider-enabled private development where terms permit,
deterministic fixture data in automated tests, and a clearly labelled fictional
broad-market benchmark in the public synthetic demo. Past outperformance of a
benchmark is not evidence of skill or future performance.

**Synthetic data**
Deterministically generated, fictional market and benchmark data used for
testing and the public demonstration. Synthetic assets and benchmarks are always
clearly labelled as such and are never presented as real market data or as SPY.

---

## Architectural terms

**ADR (Architecture Decision Record)**
A short document capturing one significant architectural decision — its context,
the decision, and its consequences. See the [ADR index](adr/README.md).

**Anti-corruption layer**
A boundary that translates an external system's data into an internal model so
that external quirks do not leak into the rest of the application. Quantora's
market-data FastAPI service is an anti-corruption layer between the application
and market-data vendors.

**Provider abstraction**
A single normalized interface implemented by every market-data provider adapter
(Twelve Data, Alpha Vantage, and the fixture provider), so providers can be
swapped without changing calling code. Provider-specific response shapes never
leave the market-data service.

**Idempotency**
The property that performing an operation more than once has the same effect as
performing it once. Quantora assigns idempotency keys to asynchronous
operations so that retries and duplicate deliveries do not create duplicate
work or data.

**Source of truth**
The authoritative, durable store for a piece of data. In Quantora, PostgreSQL is
the source of truth for portfolios, transactions, prices, and results; Redis
holds only temporary coordination data and must never be the only copy of
business data.

**Fixture provider**
A first-class market-data provider implementation that serves deterministic
synthetic data instead of calling an external API. It powers automated tests and
the public demo, and lets the system run fully offline.

**Container Apps**
Azure Container Apps — the managed platform hosting Quantora's Django API, the
two private FastAPI services, the Celery worker, and Celery Beat. The private
services use internal ingress only.

**Key Vault**
Azure Key Vault — the managed secret store holding application secrets, database
and Redis credentials, and provider keys in Azure, referenced by the application
rather than committed to the repository.

**Correlation ID**
An identifier attached to a request or job and propagated across services and
logs, so a single workflow (for example, one analysis run) can be traced from
Django through the worker to the private FastAPI services.
