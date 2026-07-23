import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { getCsrfToken } from '../../../api/csrfToken';
import { AuthContext } from '../../auth/AuthContext';
import type { AuthContextValue, AuthUser } from '../../auth/types';
import {
  AUTH_BASE_URL,
  DEFAULT_PORTFOLIO,
  portfolioArchiveUrl,
  portfolioDetailUrl,
  portfolioUnarchiveUrl,
} from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import { PortfolioDetailPage } from './PortfolioDetailPage';

const USER: AuthUser = { id: 1, email: 'user@example.com' };

const DETAIL_URL = portfolioDetailUrl(1);
const ARCHIVE_URL = portfolioArchiveUrl(1);
const UNARCHIVE_URL = portfolioUnarchiveUrl(1);
const CSRF_URL = `${AUTH_BASE_URL}/csrf/`;

const ACTIVE = DEFAULT_PORTFOLIO;
const ARCHIVED = { ...DEFAULT_PORTFOLIO, is_archived: true };

/** Render the detail page inside a router (so delete can navigate to the list
 *  stub) and behind a mock auth context with an observable expiry handler. */
function renderDetail(overrides: Partial<AuthContextValue> = {}, initialPath = '/portfolios/1') {
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
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/portfolios" element={<h1>Portfolio list stub</h1>} />
          <Route path="/portfolios/:portfolioId" element={<PortfolioDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('PortfolioDetailPage', () => {
  it('fetches on mount and shows the record with the active controls only', async () => {
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Growth' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Updated')).toBeInTheDocument();

    // Active: rename and archive are offered; unarchive and delete are not.
    expect(screen.getByRole('button', { name: 'Rename portfolio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive portfolio' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unarchive portfolio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete permanently' })).not.toBeInTheDocument();
  });

  it('shows the archived controls only for an archived portfolio', async () => {
    server.use(http.get(DETAIL_URL, () => HttpResponse.json(ARCHIVED)));
    renderDetail();

    expect(await screen.findByText('Archived')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unarchive portfolio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename portfolio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive portfolio' })).not.toBeInTheDocument();
  });

  it('renders the neutral not-found state on the concealed 404', async () => {
    server.use(
      http.get(DETAIL_URL, () => HttpResponse.json({ detail: 'Not found.' }, { status: 404 })),
    );
    renderDetail();

    expect(
      await screen.findByRole('heading', { name: 'Portfolio not found.' }),
    ).toBeInTheDocument();
    // Neutral copy: no ownership or access wording.
    expect(screen.queryByText(/permission|owner|access|denied/i)).not.toBeInTheDocument();
  });

  it('treats a malformed id as not found without making a request', async () => {
    let requests = 0;
    server.use(
      http.get(portfolioDetailUrl('abc'), () => {
        requests += 1;
        return new HttpResponse(null, { status: 404 });
      }),
    );
    renderDetail({}, '/portfolios/abc');

    expect(
      await screen.findByRole('heading', { name: 'Portfolio not found.' }),
    ).toBeInTheDocument();
    expect(requests).toBe(0);
  });

  it('offers a retry after a fetch failure and recovers on success', async () => {
    server.use(http.get(DETAIL_URL, () => new HttpResponse(null, { status: 500 })));
    renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load this portfolio/i);

    server.use(http.get(DETAIL_URL, () => HttpResponse.json(ACTIVE)));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Growth' })).toBeInTheDocument();
  });

  it('runs the session-expiry transition on a 401 fetch', async () => {
    const handleSessionExpired = vi.fn();
    server.use(http.get(DETAIL_URL, () => new HttpResponse(null, { status: 401 })));
    renderDetail({ handleSessionExpired });

    await waitFor(() => expect(handleSessionExpired).toHaveBeenCalledTimes(1));
  });

  it('aborts the fetch on unmount without updating state or logging errors', async () => {
    server.use(
      http.get(DETAIL_URL, async () => {
        await delay(50);
        return HttpResponse.json(ACTIVE);
      }),
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { unmount } = renderDetail();
    expect(screen.getByText(/Loading portfolio/)).toBeInTheDocument();
    unmount();

    await new Promise((resolve) => setTimeout(resolve, 90));
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('renames without optimistic updates, replacing state from the 200', async () => {
    server.use(
      http.patch(DETAIL_URL, async () => {
        await delay(20);
        return HttpResponse.json({ ...ACTIVE, name: 'Server Name' });
      }),
    );
    renderDetail();
    await screen.findByRole('heading', { name: 'Growth' });

    const input = screen.getByLabelText('Portfolio name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Typed Name');
    await userEvent.click(screen.getByRole('button', { name: 'Rename portfolio' }));

    // While pending, the record has not changed — no optimistic rename.
    expect(screen.getByRole('heading', { name: 'Growth' })).toBeInTheDocument();
    // The authoritative response — not the typed value — replaces the record.
    expect(await screen.findByRole('heading', { name: 'Server Name' })).toBeInTheDocument();
  });

  it('archives and flips to the archived controls from the authoritative 200', async () => {
    let archiveCalls = 0;
    server.use(
      http.post(ARCHIVE_URL, () => {
        archiveCalls += 1;
        return HttpResponse.json(ARCHIVED);
      }),
    );
    renderDetail();
    await screen.findByRole('heading', { name: 'Growth' });

    await userEvent.click(screen.getByRole('button', { name: 'Archive portfolio' }));

    expect(await screen.findByText('Archived')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unarchive portfolio' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive portfolio' })).not.toBeInTheDocument();
    expect(archiveCalls).toBe(1);
  });

  it('unarchives and flips back to the active controls', async () => {
    server.use(
      http.get(DETAIL_URL, () => HttpResponse.json(ARCHIVED)),
      http.post(UNARCHIVE_URL, () => HttpResponse.json(ACTIVE)),
    );
    renderDetail();
    await screen.findByText('Archived');

    await userEvent.click(screen.getByRole('button', { name: 'Unarchive portfolio' }));

    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive portfolio' })).toBeInTheDocument();
  });

  it('blocks a duplicate archive while one is pending', async () => {
    let archiveCalls = 0;
    server.use(
      http.post(ARCHIVE_URL, async () => {
        archiveCalls += 1;
        await delay(40);
        return HttpResponse.json(ARCHIVED);
      }),
    );
    renderDetail();
    await screen.findByRole('heading', { name: 'Growth' });

    const button = screen.getByRole('button', { name: 'Archive portfolio' });
    await userEvent.click(button);
    // The control is disabled while pending, so a second activation is inert.
    expect(screen.getByRole('button', { name: 'Archiving…' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Archiving…' }));

    await screen.findByText('Archived');
    expect(archiveCalls).toBe(1);
  });

  it('shows the delete confirmation with the name, cancels, and restores focus', async () => {
    server.use(http.get(DETAIL_URL, () => HttpResponse.json(ARCHIVED)));
    renderDetail();
    await screen.findByText('Archived');

    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    const region = screen.getByRole('group', { name: 'Confirm permanent deletion' });
    expect(region).toHaveFocus();
    expect(region).toHaveTextContent('Growth');
    expect(region).toHaveTextContent(/cannot\s+be undone/);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.queryByRole('group', { name: 'Confirm permanent deletion' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toHaveFocus();
  });

  it('deletes after confirmation and navigates to the list', async () => {
    let deleteCalls = 0;
    server.use(
      http.get(DETAIL_URL, () => HttpResponse.json(ARCHIVED)),
      http.delete(DETAIL_URL, () => {
        deleteCalls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderDetail();
    await screen.findByText('Archived');

    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(await screen.findByRole('heading', { name: 'Portfolio list stub' })).toBeInTheDocument();
    expect(deleteCalls).toBe(1);
  });

  it('shows the lifecycle message without navigating when delete is rejected', async () => {
    // A cross-tab race: the portfolio was unarchived elsewhere, so the DELETE
    // returns the lifecycle 400. The page stays put and shows the message.
    server.use(
      http.get(DETAIL_URL, () => HttpResponse.json(ARCHIVED)),
      http.delete(DETAIL_URL, () =>
        HttpResponse.json({ detail: 'Archive the portfolio before deleting it.' }, { status: 400 }),
      ),
    );
    renderDetail();
    await screen.findByText('Archived');

    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Archive the portfolio before deleting it.',
    );
    expect(screen.queryByRole('heading', { name: 'Portfolio list stub' })).not.toBeInTheDocument();
  });

  it('re-bootstraps the CSRF token on a 403 without replaying the action', async () => {
    let csrfCalls = 0;
    let archiveCalls = 0;
    server.use(
      http.get(CSRF_URL, () => {
        csrfCalls += 1;
        return HttpResponse.json({ csrf_token: 'fresh-token' });
      }),
      http.post(ARCHIVE_URL, () => {
        archiveCalls += 1;
        return HttpResponse.json({ detail: 'CSRF verification failed.' }, { status: 403 });
      }),
    );
    renderDetail();
    await screen.findByRole('heading', { name: 'Growth' });

    await userEvent.click(screen.getByRole('button', { name: 'Archive portfolio' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be verified/i);
    // ensureCsrfToken fetched once before the POST; the failure re-bootstrapped
    // exactly once more — and the POST itself was never replayed.
    await waitFor(() => expect(csrfCalls).toBe(2));
    expect(archiveCalls).toBe(1);
    expect(getCsrfToken()).toBe('fresh-token');
  });

  it('transitions to not-found when a mutation hits the concealed 404', async () => {
    server.use(http.post(ARCHIVE_URL, () => new HttpResponse(null, { status: 404 })));
    renderDetail();
    await screen.findByRole('heading', { name: 'Growth' });

    await userEvent.click(screen.getByRole('button', { name: 'Archive portfolio' }));

    expect(
      await screen.findByRole('heading', { name: 'Portfolio not found.' }),
    ).toBeInTheDocument();
  });

  it('runs the session-expiry transition when a mutation returns 401', async () => {
    const handleSessionExpired = vi.fn();
    server.use(http.post(ARCHIVE_URL, () => new HttpResponse(null, { status: 401 })));
    renderDetail({ handleSessionExpired });
    await screen.findByRole('heading', { name: 'Growth' });

    await userEvent.click(screen.getByRole('button', { name: 'Archive portfolio' }));

    await waitFor(() => expect(handleSessionExpired).toHaveBeenCalledTimes(1));
  });

  it('shows the generic throttle message on a defensive 429', async () => {
    server.use(http.post(ARCHIVE_URL, () => new HttpResponse(null, { status: 429 })));
    renderDetail();
    await screen.findByRole('heading', { name: 'Growth' });

    await userEvent.click(screen.getByRole('button', { name: 'Archive portfolio' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many requests/i);
  });

  it('shows a safe retryable message on a network failure during a mutation', async () => {
    server.use(http.post(ARCHIVE_URL, () => HttpResponse.error()));
    renderDetail();
    await screen.findByRole('heading', { name: 'Growth' });

    await userEvent.click(screen.getByRole('button', { name: 'Archive portfolio' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t reach the server/i);
  });
});
