import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LandingPage } from './LandingPage';

describe('LandingPage', () => {
  it('renders the product name as the page heading', () => {
    render(<LandingPage />);
    expect(screen.getByRole('heading', { name: 'Quantora' })).toBeInTheDocument();
  });

  it('renders the product subtitle', () => {
    render(<LandingPage />);
    expect(screen.getByText('End-of-Day Portfolio Risk Intelligence')).toBeInTheDocument();
  });

  it('renders the educational disclaimer verbatim', () => {
    render(<LandingPage />);
    expect(
      screen.getByText(
        'Quantora provides educational portfolio analytics based on historical end-of-day data. ' +
          'Results are estimates and may be delayed, incomplete, or inaccurate. Quantora does not ' +
          'provide investment advice, recommendations, forecasts, brokerage services, tax advice, ' +
          'or suitability assessments. Do not rely on Quantora as the sole basis for a financial ' +
          'decision.',
      ),
    ).toBeInTheDocument();
  });
});
