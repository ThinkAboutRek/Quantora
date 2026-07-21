import type { Portfolio } from '../types';

interface PortfolioListProps {
  readonly portfolios: readonly Portfolio[];
}

/**
 * Renders every portfolio the page holds (multiple are supported from the
 * start). The page owns the empty state, so this list is only shown when there
 * is at least one record. The copy is deliberately neutral — a name and its base
 * currency — with nothing implying advice, performance, safety, or returns.
 */
export function PortfolioList({ portfolios }: PortfolioListProps) {
  return (
    <ul className="portfolio-list" aria-label="Your portfolios">
      {portfolios.map((portfolio) => (
        <li key={portfolio.id} className="portfolio-list__item">
          <span className="portfolio-list__name">{portfolio.name}</span>
          <span className="portfolio-list__currency">{portfolio.base_currency}</span>
        </li>
      ))}
    </ul>
  );
}
