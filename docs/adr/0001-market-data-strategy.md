# ADR 001: Market Data Strategy

## ADR status

**Accepted**

## Context

Quantora needs historical and latest end-of-day prices while remaining:

* Affordable
* Reliable during development
* Testable without the internet
* Safe to deploy publicly
* Independent from one provider
* Clear about licensing and freshness
* Resistant to restrictive free-tier limits

Free market-data plans are not equivalent to unrestricted public-display licences.

Twelve Data's current Basic plan provides 8 API credits per minute and 800 requests per day, but identifies the included usage as internal non-display usage. Its terms require appropriate rights for external display or redistribution.

Alpha Vantage currently limits its free service to 25 requests per day. Its standard terms focus on personal, non-commercial use and treat broader external access or commercial activity separately.

Therefore, neither free plan will be treated as an unrestricted licence for the public Quantora demonstration.

---

## Decision 1: Primary development provider

**Twelve Data is the primary live development provider.**

Reasons:

* Its free development allowance is more practical than a 25-request daily limit.
* It supports the US equities and ETFs needed for V1.
* It has asset search, reference data, and historical time-series endpoints.
* Its credit model makes provider quota handling worth demonstrating.
* It provides a useful example of integrating a commercial third-party service.

Restrictions:

* It is enabled only in local development, private testing, or an environment with suitable data-display rights.
* Its key is supplied through environment configuration or Azure Key Vault.
* Provider responses are never committed to the public repository.
* The free plan is not used to populate an unrestricted public demo.
* The adapter can be disabled without disabling Quantora.

---

## Decision 2: Secondary live provider

**Alpha Vantage is the secondary live provider adapter.**

Its role is:

* Demonstrating provider portability
* Supporting development when Twelve Data is unavailable
* Verifying that the internal market-data contract is genuinely provider-independent
* Providing limited manual fallback during local development

Restrictions:

* It is disabled by default.
* It requires the developer's own key.
* It is not called automatically for every Twelve Data failure.
* It is not treated as a licence for unrestricted public display.
* Its 25-request daily limit means it is unsuitable for broad automatic refreshes on the free tier.

---

## Decision 3: Public demonstration data

**The public Quantora demonstration runs in deterministic synthetic-data mode unless an appropriate commercial or display licence is obtained.**

The public demo contains:

* Fictional assets
* Fictional price histories
* A fictional benchmark series shaped similarly to a broad market index
* Multiple market regimes
* Rising periods
* Falling periods
* A significant drawdown
* Different volatility levels
* Different correlations
* A concentrated sample portfolio
* A more diversified sample portfolio

All synthetic assets are visibly labelled as demonstration data.

No provider response files are committed to Git.

This makes the public demonstration:

* Reproducible
* Reliable
* Fast
* Legally safer
* Independent from vendor availability
* Suitable for automated testing
* Easy for reviewers to explore

---

## Decision 4: Fixture strategy

Three fixture categories are used.

### Unit-test fixtures

Small, hand-calculated datasets covering:

* Constant prices
* Positive returns
* Negative returns
* Missing trading days
* Zero variance
* Maximum drawdown
* Trades during the analysis period
* Concentrated portfolios
* Empty portfolios
* Insufficient history
* Provider errors

These fixtures should be small enough for a developer to verify manually.

### Integration-test fixtures

Recorded internal normalized payloads, not copied vendor responses.

These represent:

* Asset search results
* Asset metadata
* Daily price bars
* Pagination
* Rate-limit errors
* Timeouts
* Invalid symbols
* Partial data
* Duplicate dates

### Demo fixtures

A larger deterministic synthetic dataset supporting the public demonstration workflow.

Demo data is created from a fixed random seed or checked-in generated CSV files so every environment produces the same results.

---

## Decision 5: CSV strategy

Quantora has two separate CSV workflows.

### User transaction CSV

This is a public V1 feature.

Required fields:

* `symbol`
* `transaction_type`
* `quantity`
* `unit_price`
* `trade_date`

Optional fields:

* `fee`
* `note`

Validation includes:

* Recognised transaction type
* Valid decimal formats
* Positive quantity
* Non-negative fee
* Valid date
* Known or resolvable symbol
* No final negative position
* Duplicate-row detection

### Historical-price fixture CSV

This is an internal developer and administrator tool.

Fields:

* `symbol`
* `date`
* `open`
* `high`
* `low`
* `close`
* `adjusted_close`
* `volume`
* `currency`
* `source`
* `is_synthetic`

It is used for:

* Demo bootstrapping
* Test setup
* Offline development
* Disaster recovery of synthetic datasets

It is not a general user market-data upload feature in V1.

---

## Decision 6: Provider abstraction

The market-data FastAPI service owns provider integration.

It exposes a normalized internal interface with these capabilities:

```text
search_assets(query)
get_asset(symbol)
get_latest_eod_price(symbol)
get_eod_history(symbol, start_date, end_date)
get_provider_status()
```

Every adapter implements the same Python protocol or abstract base class.

V1 adapters:

```text
TwelveDataProvider
AlphaVantageProvider
FixtureProvider
```

Normalized Pydantic contracts include:

```text
AssetReference
AssetMetadata
EndOfDayBar
PriceSeries
ProviderStatus
ProviderError
```

Every normalized price record includes:

* Internal asset identifier
* Provider symbol
* Trading date
* Currency
* Open
* High
* Low
* Close
* Adjusted close
* Volume
* Provider name
* Retrieval timestamp
* Synthetic-data flag

Provider-specific response shapes must never leak beyond the market-data service.

---

## Decision 7: Provider selection and fallback

Provider order is configured per environment.

### Local development

```text
Twelve Data
Alpha Vantage
Fixture provider
```

### Automated tests

```text
Fixture provider only
```

### Public demonstration

```text
Fixture provider only
```

### Licensed production environment

```text
Licensed primary provider
Licensed secondary provider
Last-known PostgreSQL data
```

Fallback is never silent.

Every result includes:

* Provider name
* Data as-of date
* Retrieval status
* Whether fallback was used
* Whether data is stale
* Whether data is synthetic

Quantora does not combine overlapping price histories from different providers within one analysis run unless an explicit, tested reconciliation process is added later.

This avoids subtle differences in:

* Corporate-action adjustment
* Symbol mapping
* Missing dates
* Exchange calendars
* Price precision

---

## Decision 8: Data freshness

Quantora is an end-of-day system.

A price refresh is requested no more than once per asset per 24-hour period unless an administrator forces a refresh.

Freshness states:

### Fresh

The most recent stored data was successfully retrieved during the expected refresh window and represents the latest completed provider trading day.

### Stale

Existing data is available, but the latest refresh failed or the data has passed the configured freshness threshold.

### Unavailable

No usable historical data exists for the requested analysis.

The interface always displays the actual market-data date.

Quantora does not substitute the current calendar date as the data date.

When a provider fails:

1. The task retries transient failures.
2. The secondary provider may be tried when enabled and licensed.
3. Otherwise, the latest stored data is used.
4. The result is marked stale.
5. The user can see the stale-data warning.
6. The failure is logged and attached to the analysis run.

A stale result remains viewable because historical analysis can still be useful, but it must never appear current.

---

## Decision 9: PostgreSQL storage

PostgreSQL is the durable source of truth.

It stores:

### Asset identity

* Canonical symbol
* Asset name
* Exchange
* Asset type
* Currency
* Active status
* Provider symbol mappings

### Historical market data

* Asset
* Trading date
* Adjusted closing price
* Optional OHLCV fields
* Provider
* Retrieval timestamp
* Synthetic-data flag
* Data-quality flags

A unique constraint prevents duplicate canonical daily bars for the same asset, date, and accepted source version.

### Provider state

* Provider name
* Last successful request
* Last failed request
* Current health state
* Quota or throttling state
* Last synchronized date per asset
* Error category
* Error-safe message

### Product data

* Portfolios
* Transactions
* Derived holdings
* Analysis runs
* Metric results
* Scenario runs
* Scenario results
* Benchmark configuration
* Data provenance attached to each analysis

Historical prices are not deleted merely because a Redis cache expires.

---

## Decision 10: Redis storage

Redis is used for short-lived and coordination data only.

It stores:

* Celery broker messages
* Provider rate-limit counters
* Application rate-limit counters
* Distributed refresh locks
* Asset-search cache
* Short-lived provider response cache
* Latest-price cache
* Analysis-progress cache
* Idempotency and deduplication locks

Redis does not store:

* The only copy of market prices
* The only copy of job state
* User portfolios
* Transactions
* Final risk results
* Permanent audit history

Recommended TTLs:

* Asset search: 6 hours
* Asset metadata: 24 hours
* Latest EOD lookup: until the next expected refresh window
* Historical-range response: 24 hours
* Provider failure marker: 1 to 5 minutes
* Distributed refresh lock: bounded to the expected task duration
* Progress cache: analysis duration plus 1 hour

Azure production should use **Azure Managed Redis**, rather than designing around the older product name. Microsoft documents it as a managed Redis-compatible store suitable for caching, deduplication, and job or message queuing alongside Azure Container Apps.

For cost control, V1 uses one Redis deployment with strict key prefixes, short cache TTLs, memory monitoring, and an eviction configuration that does not risk deleting queue messages.

---

## Decision 11: Testing without live APIs

No automated test is allowed to require a real market-data provider.

Tests use:

* Dependency-injected provider adapters
* FixtureProvider
* Mock HTTP transport
* Normalized response fixtures
* Explicit timeout fixtures
* Explicit throttling fixtures
* Contract tests shared by every provider adapter

Each provider adapter must pass the same contract test suite.

Live-provider tests are:

* Marked separately
* Excluded from normal CI
* Run manually
* Protected by environment variables
* Rate-limit aware
* Never required for a pull request to pass

CI must remain green even when every external provider is unavailable.

---

## Consequences

### Positive

* Public demos remain stable.
* Tests remain deterministic.
* Licensing exposure is reduced.
* Providers can be replaced.
* Rate-limit behaviour becomes part of the architecture.
* Provider failures can be demonstrated safely.
* Calculations are reproducible.

### Negative

* The public demo does not automatically show current real-world prices.
* More adapter and fixture code is required.
* Provider differences must be normalized carefully.
* A commercial public launch would still require a proper data licence.

These costs are accepted.

---
