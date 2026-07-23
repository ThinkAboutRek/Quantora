import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../auth/AuthContext';
import type { AuthContextValue, AuthUser } from '../../auth/types';
import { PORTFOLIOS_URL } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import type { Portfolio } from '../types';
import { PortfoliosPage } from './PortfoliosPage';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const USER: AuthUser = { id: 1, email: 'user@example.com' };

function makePortfolio(id: number, name: string, isArchived = false): Portfolio {
  return {
    id,
    name,
    base_currency: 'USD',
    is_archived: isArchived,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

/** Register a list handler that serves distinct active and archived arrays,
 *  proving the page requests exactly one state at a time. */
function serveLists(active: Portfolio[], archived: Portfolio[]) {
  server.use(
    http.get(PORTFOLIOS_URL, ({ request }) => {
      const filter = new URL(request.url).searchParams.get('archived');
      return HttpResponse.json(filter === 'true' ? archived : active);
    }),
  );
}

/** Render the page behind a mock auth context so no real session probe fires and
 *  the session-expiry handler is observable. A router is required because list
 *  items link to their detail routes. */
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
      <MemoryRouter initialEntries={['/portfolios']}>
        <PortfoliosPage />
      </MemoryRouter>
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

  it('links every portfolio to its detail route', async () => {
    server.use(http.get(PORTFOLIOS_URL, () => HttpResponse.json([makePortfolio(7, 'Growth')])));
    renderPage();

    const link = await screen.findByRole('link', { name: /Growth/ });
    expect(link).toHaveAttribute('href', '/portfolios/7');
  });

  it('defaults to the active list without requesting the archived one', async () => {
    let archivedRequests = 0;
    server.use(
      http.get(PORTFOLIOS_URL, ({ request }) => {
        if (new URL(request.url).searchParams.get('archived') === 'true') {
          archivedRequests += 1;
          return HttpResponse.json([]);
        }
        return HttpResponse.json([makePortfolio(1, 'Active one')]);
      }),
    );
    renderPage();

    expect(await screen.findByText('Active one')).toBeInTheDocument();
    expect(archivedRequests).toBe(0);
    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Archived' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('fetches and shows the archived list when Archived is selected', async () => {
    serveLists([makePortfolio(1, 'Active one')], [makePortfolio(2, 'Old one', true)]);
    renderPage();
    expect(await screen.findByText('Active one')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Archived' }));

    expect(await screen.findByText('Old one')).toBeInTheDocument();
    expect(screen.queryByText('Active one')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archived' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows a distinct archived loading and empty state, without the create form', async () => {
    server.use(
      http.get(PORTFOLIOS_URL, async ({ request }) => {
        if (new URL(request.url).searchParams.get('archived') === 'true') {
          await delay(20);
          return HttpResponse.json([]);
        }
        return HttpResponse.json([]);
      }),
    );
    renderPage();
    await screen.findByText(/have any portfolios yet/);

    await userEvent.click(screen.getByRole('button', { name: 'Archived' }));

    expect(screen.getByText(/Loading your archived portfolios/)).toBeInTheDocument();
    expect(await screen.findByText(/have any archived portfolios/)).toBeInTheDocument();
    // The create form belongs to the active view only.
    expect(screen.queryByRole('button', { name: 'Create portfolio' })).not.toBeInTheDocument();
  });

  it('returns to the active list when Active is selected again', async () => {
    serveLists([makePortfolio(1, 'Active one')], [makePortfolio(2, 'Old one', true)]);
    renderPage();
    await screen.findByText('Active one');

    await userEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await screen.findByText('Old one');
    await userEvent.click(screen.getByRole('button', { name: 'Active' }));

    expect(await screen.findByText('Active one')).toBeInTheDocument();
    expect(screen.queryByText('Old one')).not.toBeInTheDocument();
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
