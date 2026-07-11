# Quantora Product Charter

## 1. Product identity

### Project name

**Quantora**

### Subtitle

**End-of-Day Portfolio Risk Intelligence**

### Product description

Quantora is a cloud-native portfolio analytics platform that converts transaction history and end-of-day market data into understandable portfolio valuations, performance views, risk metrics, benchmark comparisons, and simple scenario analysis.

Quantora provides visibility and education. It does not predict markets, recommend investments, execute trades, or assess whether an investment is suitable for a user.

---

## 2. Product purpose

Quantora exists to help users answer questions such as:

* What is my portfolio currently worth?
* Which holdings dominate my portfolio?
* How has the portfolio behaved historically?
* How volatile has it been?
* What was its largest historical decline?
* How did it perform against a benchmark?
* What would happen to its value under a simple hypothetical price shock?
* How fresh and complete is the data behind these results?

The project must also demonstrate production-minded software engineering:

* Domain modelling
* REST API design
* Service boundaries
* Asynchronous processing
* Data-provider integration
* Financial calculations
* Caching and rate limiting
* Testing
* Containerisation
* Cloud deployment
* Monitoring
* Documentation
* CI/CD
* Failure handling

---

## 3. Target users

### Primary product user

An individual who wants educational visibility into a small, long-only portfolio of US-listed equities and ETFs.

The user understands that Quantora is an analytics tool rather than a broker, adviser, or market-data terminal.

### Secondary audience

The project is also designed for:

* Software engineering recruiters
* Hiring managers
* Technical interviewers
* Backend and platform engineers reviewing the architecture
* Developers learning portfolio analytics

Quantora should remain a credible product rather than becoming a collection of disconnected technical demonstrations.

---

## 4. Main user problem

Many basic portfolio trackers show current holdings and profit or loss but provide limited explanation of:

* Concentration
* Historical volatility
* Drawdowns
* Benchmark-relative performance
* Portfolio-wide exposure
* The effect of hypothetical price movements
* Data quality and freshness

Professional risk platforms solve these problems but are often too complex, expensive, or unsuitable for an educational portfolio project.

---

## 5. Core value proposition

> Quantora turns a transaction history into clear, explainable end-of-day portfolio risk analytics without attempting to predict markets or tell users what to buy or sell.

The distinguishing qualities are:

* Explainable metrics
* Transparent calculation methodology
* Visible data freshness
* Reproducible results
* Resilient provider integration
* Safe, neutral financial language
* Production-style cloud architecture

---

## 6. V1 product constraints

V1 is intentionally limited to:

* US-listed common equities
* US-listed ETFs
* USD-denominated portfolios
* Long positions only
* End-of-day data only
* One comparison benchmark, SPY
* Historical adjusted closing prices
* Transaction-based portfolios
* Average-cost unrealised profit and loss
* One simple price-shock scenario workflow

V1 does not maintain a complete brokerage cash ledger.

Portfolio value represents the market value of tracked holdings and excludes uninvested cash. The interface and methodology documentation must state this clearly.

Transactions entered for a trading date affect portfolio risk returns from the following trading day. This prevents trade-day timing assumptions from distorting the return series.

---

## 7. Exact V1 scope

### 7.1 User accounts

V1 includes:

* Registration
* Login
* Logout
* Authenticated user sessions
* User-level portfolio isolation
* Basic account settings
* Demo account or demo-mode access

Password resets and social authentication may be added later unless they are straightforward to include through the chosen authentication package.

### 7.2 Portfolio management

Users can:

* Create multiple portfolios
* Rename portfolios
* Archive or delete portfolios
* Select a portfolio base currency, fixed to USD in V1
* Choose SPY as the fixed V1 benchmark
* View the latest portfolio data date
* Request a data refresh and analysis run

### 7.3 Transaction management

Supported transaction types:

* Buy
* Sell

Each transaction contains:

* Asset
* Transaction type
* Quantity
* Unit price
* Trade date
* Optional fee
* Optional note

V1 uses weighted average cost for estimated cost basis and unrealised profit or loss.

This is an analytics convention only. It must not be described as a tax calculation or official accounting treatment.

Users can:

* Add transactions manually
* Edit transactions
* Delete transactions
* Import transactions using Quantora's documented CSV template
* Review CSV validation errors before records are committed

The CSV import must be atomic by default. A file with blocking validation errors is rejected without partially creating transactions.

### 7.4 Derived holdings

Quantora derives current holdings from the transaction ledger.

For each holding, the user sees:

* Symbol
* Asset name
* Quantity
* Average cost
* Latest end-of-day price
* Market value
* Portfolio weight
* Estimated unrealised profit or loss
* Price as-of date

Negative final quantities are not permitted in V1.

### 7.5 Market-data workflow

Quantora can:

* Search supported assets
* Retrieve asset metadata
* Retrieve historical end-of-day prices
* Retrieve the latest completed end-of-day price
* Normalise provider data into one internal contract
* Store data provenance and timestamps
* Serve last-known data when a provider is unavailable
* Clearly label stale or unavailable data

The public demonstration environment uses licensed data only when appropriate rights have been obtained. Otherwise, it runs with deterministic synthetic demo data.

### 7.6 V1 metrics

#### Portfolio value

The latest market value of all tracked holdings.

#### Asset allocation

The percentage of the portfolio represented by each holding.

#### Estimated unrealised profit or loss

The difference between current holding value and weighted average acquisition cost.

#### Daily portfolio returns

Daily returns are calculated using the previous trading day's holding weights and each asset's daily adjusted-price return.

This avoids treating purchases and sales as investment performance.

#### Annualised volatility

The standard deviation of daily portfolio returns, annualised using 252 trading days.

Default period:

* Trailing 12 months where sufficient data exists
* Minimum 30 daily observations

Results with insufficient observations are shown as unavailable rather than estimated from an inadequate sample.

#### Maximum drawdown

The largest peak-to-trough decline in the cumulative portfolio return series during the selected period.

#### Concentration risk

V1 presents:

* Largest holding weight
* Top-three holdings weight
* Herfindahl-Hirschman Index, or HHI

The application explains these measurements neutrally. It does not classify a portfolio as objectively safe or unsafe.

#### Benchmark comparison

Quantora compares the portfolio's cumulative return with SPY over the same date range.

The comparison includes:

* Portfolio cumulative return
* Benchmark cumulative return
* Difference between the two
* A time-series chart

Quantora does not describe outperforming the benchmark as proof of skill or future performance.

#### Simple scenario analysis

The user can apply percentage price shocks to one or more current holdings.

Example:

* Asset A: minus 10%
* Asset B: minus 5%
* Remaining assets: unchanged

The result shows:

* Portfolio value before the scenario
* Hypothetical value after the scenario
* Estimated monetary change
* Estimated percentage change
* Contribution from each shocked holding

The scenario is static and instantaneous. It does not model correlations, market reactions, liquidity, volatility changes, or future probability.

### 7.7 Explainable insights

V1 uses deterministic templates rather than generative AI.

Examples:

* “The largest holding represents 38.4% of the tracked portfolio value.”
* “The portfolio's maximum drawdown over the selected period was 17.2%.”
* “Historical data is available through 8 July 2026.”
* “This scenario would reduce the tracked portfolio value by approximately 6.1%.”

Forbidden examples:

* “This portfolio is dangerously concentrated.”
* “You should reduce this position.”
* “This asset is likely to fall.”
* “This is a low-risk portfolio.”
* “You are on track to outperform the market.”

### 7.8 Analysis jobs

Market refreshes and portfolio analysis run asynchronously.

Users can see:

* Queued
* Fetching market data
* Preparing time series
* Calculating metrics
* Saving results
* Completed
* Failed

The interface includes approximate progress, current stage, start time, completion time, and a retry action after recoverable failures.

### 7.9 Product pages

V1 includes:

* Landing page
* Registration and login
* Portfolio list
* Create portfolio
* Portfolio overview dashboard
* Transactions page
* CSV import page
* Holdings table
* Risk analytics page
* Benchmark comparison section
* Scenario analysis page
* Analysis history or recent runs section
* Settings
* Methodology and disclaimer page
* Error and unavailable-data states

---

## 8. V1.5 scope

V1.5 improves usability and presentation without changing the core architecture.

It includes:

* Watchlists
* Asset detail pages
* Sector and industry allocation where licensed metadata is available
* Saved scenarios
* Portfolio comparison
* Downloadable analytics reports
* CSV export of user-owned portfolio and result data
* Improved demo onboarding
* Shareable read-only demo snapshots
* Analysis history with comparison between runs
* Better accessibility
* Better mobile and tablet layouts
* Scheduled provider-enabled end-of-day refreshes
* Email or in-app notifications for failed and completed analyses
* Expanded observability dashboards
* Performance optimisation based on measured bottlenecks

V1.5 remains USD-only and long-only.

---

## 9. V2 scope

V2 may add:

* Multiple portfolio base currencies
* Daily foreign exchange conversion
* UK and selected international equities and ETFs
* Custom benchmarks
* Multiple benchmark comparison
* Cash balance modelling
* Deposits and withdrawals
* Time-weighted performance with explicit external cash flows
* Portfolio-level sector, geography, and currency exposure
* Rebalancing simulation without recommendations
* More detailed historical scenario templates
* Correlation matrix
* Rolling volatility and rolling drawdown
* Carefully implemented historical Value at Risk
* Report generation
* Organisation or team accounts
* Role-based access control
* Audit logs

Value at Risk is deferred until the simpler metrics, time-series construction, methodology, and tests are demonstrably correct.

---

## 10. Explicit non-goals

The following are permanent non-goals unless the entire product direction is formally reconsidered:

* Trade execution
* Automated trading
* Trading signals
* Stock-price prediction
* Expected-price targets
* Buy, hold, or sell recommendations
* Personalised investment recommendations
* Suitability assessments
* Portfolio optimisation that tells users what to purchase
* Guaranteed outcome claims
* Guaranteed risk classifications
* Social trading
* Copy trading
* Financial adviser replacement
* Broker replacement
* Tax advice
* Tax reporting
* Regulatory compliance certification
* Professional institutional risk certification

The following are also excluded from V1 and V1.5:

* Real-time streaming
* Intraday charts
* Options
* Futures
* Leveraged products
* Short positions
* Margin
* Broker integrations
* Public API keys
* Third-party developer access
* Raw market-data redistribution
* Machine-generated financial recommendations
* LLM-generated portfolio advice

---

## 11. Main demonstration workflow

A complete product demonstration should take approximately five minutes.

1. Open Quantora and enter the demo account.
2. View a preloaded sample portfolio.
3. Create a second portfolio.
4. Upload the provided transaction CSV.
5. Review parsed transactions and resolve or demonstrate validation feedback.
6. Submit the import.
7. Start the portfolio analysis.
8. Watch the job move through its processing stages.
9. View the resulting portfolio value, allocation, profit or loss, volatility, drawdown, and concentration.
10. Compare the portfolio with SPY.
11. Open the methodology explanation for one metric.
12. Run a negative price-shock scenario.
13. View the hypothetical effect and holding contributions.
14. Show the market-data as-of date, provider status, and stale-data behaviour.
15. Briefly show the Azure deployment, GitHub Actions workflow, tests, service diagram, logs, and API documentation.

---

## 12. Success criteria

Quantora V1 is complete only when all of the following are true.

### Product completion

* A user can create a portfolio from registration through analysis.
* Manual and CSV transaction workflows work end to end.
* All locked V1 metrics are available.
* The SPY comparison works.
* The scenario workflow works.
* Analysis progress and failures are visible.
* The public demonstration does not require a live provider.

### Correctness

* All risk-engine calculations are deterministic.
* Every metric has documented inputs, formula, assumptions, and limitations.
* Risk-engine calculations have at least 90% line coverage.
* Critical Django domain logic has strong unit and integration coverage.
* Fixture-based expected results are independently hand-checked.
* Insufficient-data cases return explicit unavailable results.
* User isolation and object-permission tests exist.

### Engineering quality

* React, Django, both FastAPI services, worker, PostgreSQL, and Redis run through Docker Compose.
* CI runs formatting, linting, type checks, unit tests, integration tests, and frontend tests.
* Playwright covers the primary demonstration workflow.
* API contracts are versioned.
* Database migrations are reproducible.
* Services have health and readiness endpoints.
* Structured logging includes request and correlation IDs.
* Provider errors do not expose credentials or raw secrets.
* Azure infrastructure is documented and reproducible.

### Portfolio quality

* The README explains the product before the technology.
* Architecture diagrams are included.
* Accepted ADRs are included.
* Screenshots or a short demo video are included.
* The case study explains tradeoffs and rejected alternatives.
* A recruiter can understand the product's purpose within one minute.
* A technical interviewer can inspect meaningful backend, frontend, cloud, testing, and architectural decisions.

---

## 13. Safe finance positioning

### Required positioning

Quantora should consistently describe itself using phrases such as:

* Portfolio analytics
* Risk visibility
* Historical analysis
* End-of-day analytics
* Educational financial intelligence
* Hypothetical scenario
* Estimated result
* Historical observation
* Tracked portfolio
* Data as of a specific date

### Required disclaimer

The following wording should appear on the landing page, onboarding flow, methodology page, and analytics interface:

> Quantora provides educational portfolio analytics based on historical end-of-day data. Results are estimates and may be delayed, incomplete, or inaccurate. Quantora does not provide investment advice, recommendations, forecasts, brokerage services, tax advice, or suitability assessments. Do not rely on Quantora as the sole basis for a financial decision.

Scenario pages should additionally state:

> Scenario results are hypothetical illustrations, not predictions. They do not estimate the probability that a market movement will occur.

### Wording rules

Quantora must not say:

* “You should”
* “We recommend”
* “Best investment”
* “Safe investment”
* “Low-risk investment”
* “Guaranteed”
* “Expected to rise”
* “Likely to outperform”
* “Ideal allocation”
* “Optimal portfolio”
* “Suitable for you”
* “Reduce this holding”
* “Buy now”
* “Sell now”

Quantora may state factual calculations:

* “This holding represents 42% of tracked portfolio value.”
* “Historical annualised volatility was 19.6%.”
* “The portfolio declined by 14.2% from its historical peak.”
* “Under the selected hypothetical shocks, portfolio value would decrease by approximately $X or Y%.”

### Product safeguards

Every financial output should include:

* Data as-of date
* Selected analysis period
* Calculation methodology
* Data sufficiency status
* Relevant limitations
* Neutral explanatory wording

The disclaimer is a product safeguard, not a guarantee that every future feature falls outside financial-services regulation. Any commercial launch, personalised feature, financial promotion, or recommendation feature would require proper UK legal and regulatory review.

---

---

# Appendix: Locked Decisions

## Product

* Quantora is an end-of-day portfolio risk intelligence platform.
* It supports US-listed equities and ETFs, USD, long-only portfolios in V1.
* It tracks transactions and derives holdings.
* It excludes uninvested cash from V1 portfolio value.
* Unrealised profit or loss uses weighted average cost and is not a tax calculation.
* SPY is the single V1 benchmark.
* V1 includes value, allocation, unrealised profit or loss, daily returns, volatility, maximum drawdown, concentration, benchmark comparison, and one price-shock scenario.
* V1 uses deterministic neutral insights.
* Trading, prediction, recommendations, suitability, options, real-time streaming, broker integrations, and public API keys are excluded.

## Market data

* Twelve Data is the primary live development provider.
* Alpha Vantage is the secondary development adapter.
* Neither free tier is assumed to permit unrestricted public display.
* The public demo uses deterministic synthetic data unless appropriate licensing is obtained.
* Tests never call live providers.
* A FixtureProvider is a first-class provider implementation.
* PostgreSQL stores normalized historical data and provenance.
* Redis stores only temporary caches, locks, quotas, and coordination data.
* Provider fallback is explicit and visible.
* Stale data is served only with a clear warning and as-of date.

## Asynchronous processing

* Celery is the task system.
* Redis is the broker.
* PostgreSQL stores canonical job state.
* Celery Beat schedules periodic work.
* Azure Container Apps Jobs is not used as the primary V1 job system.
* Provider refresh, portfolio analysis, scenarios, substantial CSV imports, and maintenance run asynchronously.
* Tasks use bounded retries, exponential backoff, jitter, timeouts, and idempotency keys.
* React polls Django for progress.
* WebSockets and Server-Sent Events are excluded from V1.

## Services

* React calls Django only.
* Django is the only public application API.
* V1 has exactly two FastAPI services.
* The market-data service owns provider integration and normalization.
* The risk engine owns deterministic financial calculations.
* Both FastAPI services are private and stateless.
* The Celery worker orchestrates services and persists results.
* Only Django domain code writes product-domain data to PostgreSQL.
* There is no separate insight service in V1.
* Azure Managed Redis is used for the Azure Redis deployment.
* React uses Azure Static Web Apps.
* Django, FastAPI services, worker, and Beat use Azure Container Apps.
