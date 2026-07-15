/**
 * Public landing page. It states what Quantora is in neutral terms and carries
 * the charter's educational disclaimer verbatim. It intentionally has no
 * calls-to-action, metric values, charts, or advisory wording.
 */
export function LandingPage() {
  return (
    <section className="landing" aria-labelledby="landing-heading">
      <h1 id="landing-heading" className="landing__name">
        Quantora
      </h1>
      <p className="landing__subtitle">End-of-Day Portfolio Risk Intelligence</p>
      <p className="landing__intro">
        Quantora turns a transaction history and end-of-day market data into clear, explainable
        portfolio valuations, performance views, and risk metrics.
      </p>
      <p className="landing__disclaimer">
        Quantora provides educational portfolio analytics based on historical end-of-day data.
        Results are estimates and may be delayed, incomplete, or inaccurate. Quantora does not
        provide investment advice, recommendations, forecasts, brokerage services, tax advice, or
        suitability assessments. Do not rely on Quantora as the sole basis for a financial decision.
      </p>
    </section>
  );
}
