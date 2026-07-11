# Quantora Roadmap Corrections

## Insert after Section 1.3: Python and Node Package Management

### 1.4 Charting and Benchmark Data Rules

#### Charting library

**Apache ECharts is Quantora's only general-purpose charting library.**

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

#### Benchmark data behaviour

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

# Corrected Phase 33

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

# Corrected Phase 37

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

# Corrected Phase 38

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

# Corrected Phase 39

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

# Corrected Phase 40

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

---

# Corrected Phase 44 Test and Verification Section

Replace the numbered cloud workflow in Phase 44 with:

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

---

# Corrected Phase 59 Build Section

Replace the `Build` line in Phase 59 with:

**Build:** A versioned HTML or PDF report containing methodology references, disclaimers, provenance, and charts produced from the same Apache ECharts chart definitions or exported ECharts assets used by the React interface. Do not introduce a second general-purpose charting library for report generation.

---

# Corrected MVP Complete Benchmark Requirement

Replace:

> SPY benchmark comparison works.

With:

> The benchmark-comparison workflow works with actual SPY data in provider-enabled private development where permitted, deterministic fixture benchmark data in automated tests, and a clearly labelled fictional broad-market benchmark in the public synthetic demo.

Add immediately after it:

> Synthetic benchmark data is never labelled as SPY, and the same date-alignment, cumulative-return, comparison, provenance, freshness, and sufficiency logic is used for both real and synthetic benchmark inputs.

---

# Corrected Strong Portfolio Version Requirements

Add the following requirements to the Strong Portfolio Version definition:

* Apache ECharts is the only installed general-purpose charting library.
* Allocation, cumulative-return, benchmark-comparison, drawdown, and scenario visualisations use reusable Apache ECharts components.
* Chart data is produced by the server and remains consistent with accessible tables or text summaries.
* The public demonstration clearly labels its fictional broad-market benchmark as synthetic.
* No public-demo page or documentation claims that synthetic benchmark data represents actual SPY prices.

---

# Corrected Final Direction

Replace:

> One benchmark

With:

> One source-independent benchmark-comparison workflow, using actual SPY only in provider-enabled private development where provider terms permit it, deterministic fixture benchmark data in automated tests, and a clearly labelled fictional broad-market benchmark in the public synthetic demo.

Add the following charting rule to the final direction list:

> Apache ECharts is Quantora's only general-purpose charting library and is used for allocation, cumulative-return, benchmark, drawdown, scenario, treemap, and future heatmap visualisations.

Replace:

> One benchmark comparison

Wherever it appears in roadmap summaries with:

> One benchmark-comparison workflow with environment-appropriate real or synthetic benchmark data

---

# Repository Dependency Verification

The frontend dependency checks in Phases 37, 38, 39, 47, and 48 must verify:

```text
apache-echarts
```

or the selected official Apache ECharts package and React integration are present.

They must also verify that packages such as the following are not introduced as parallel general-purpose charting systems:

```text
recharts
chart.js
react-chartjs-2
highcharts
victory
nivo
```

A narrowly focused specialist visualisation dependency may only be added later through an accepted ADR demonstrating that Apache ECharts cannot satisfy the requirement.
