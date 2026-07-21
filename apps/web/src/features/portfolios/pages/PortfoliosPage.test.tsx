import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../auth/AuthContext';
import type { AuthContextValue, AuthUser } from '../../auth/types';
import { PORTFOLIOS_URL } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import type { Portfolio } from '../types';
import { PortfoliosPage } from './PortfoliosPage';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const USER: AuthUser = { id: 1, email: 'user@example.com' };

function makePortfolio(id: number, name: string): Portfolio {
  return {
    id,
    name,
    base_currency: 'USD',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

/** Render the page behind a mock auth context so no real session probe fires and
 *  the session-expiry handler is observable. */
function renderPage(overrides: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = {
    user: USER,
    status: 'authenticated',
    login: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    retrySessionRestore: vi.fn(),
    handleSessionExpired: vi.fn(),
    ...overrides,
  };
  return render(
    <AuthContext.Provider value={value}>
      <PortfoliosPage />
    </AuthContext.Provider>,
  );
}

describe('PortfoliosPage', () => {
  it('shows the initial loading state while the list is in flight', async () => {
    server.use(
      http.get(PORTFOLIOS_URL, async () => {
        await delay(20);
        return HttpResponse.json([]);
      }),
    );
    renderPage();

    expect(screen.getByText(/Loading your portfolios/)).toBeInTheDocument();
    // Flush the resolution so the update happens inside act.
    expect(await screen.findByText(/have any portfolios yet/)).toBeInTheDocument();
  });

  it('renders the heading and creation form once loaded', async () => {
    server.use(http.get(PORTFOLIOS_URL, () => HttpResponse.json([])));
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Portfolios' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create portfolio' })).toBeInTheDocument();
  });

  it('shows the empty state (distinct from loading) when there are no portfolios', async () => {
    server.use(http.get(PORTFOLIOS_URL, () => HttpResponse.json([])));
    renderPage();

    expect(await screen.findByText(/have any portfolios yet/)).toBeInTheDocument();
    expect(screen.queryByText(/Loading your portfolios/)).not.toBeInTheDocument();
  });

  it('renders every returned portfolio in newest-first order', async () => {
    server.use(
      http.get(PORTFOLIOS_URL, () =>
        HttpResponse.json([makePortfolio(3, 'Third'), makePortfolio(1, 'First')]),
      ),
    );
    renderPage();

    expect(await screen.findByText('Third')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').map((node) => node.textContent);
    expect(items[0]).toContain('Third');
    expect(items[1]).toContain('First');
  });

  it('offers a retry after a list failure and recovers on success', async () => {
    server.use(http.get(PORTFOLIOS_URL, () => new HttpResponse(null, { status: 500 })));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load your portfolios/i);
    const retry = screen.getByRole('button', { name: 'Try again' });

    server.use(http.get(PORTFOLIOS_URL, () => HttpResponse.json([makePortfolio(5, 'Recovered')])));
    await userEvent.click(retry);

    expect(await screen.findByText('Recovered')).toBeInTheDocument();
  });

  it('aborts the fetch on unmount without updating state or logging errors', async () => {
    server.use(
      http.get(PORTFOLIOS_URL, async () => {
        await delay(50);
        return HttpResponse.json([]);
      }),
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { unmount } = renderPage();
    expect(screen.getByText(/Loading your portfolios/)).toBeInTheDocument();
    unmount();

    // Let the delayed response resolve after the abort; nothing should throw and
    // React should log no unmounted-update / act warning.
    await sleep(90);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('runs the session-expiry transition on a 401 instead of rendering empty', async () => {
    const handleSessionExpired = vi.fn();
    server.use(http.get(PORTFOLIOS_URL, () => new HttpResponse(null, { status: 401 })));
    renderPage({ handleSessionExpired });

    await waitFor(() => expect(handleSessionExpired).toHaveBeenCalledTimes(1));
    // It must not fall through to the empty state.
    expect(screen.queryByText(/have any portfolios yet/)).not.toBeInTheDocument();
  });
});
