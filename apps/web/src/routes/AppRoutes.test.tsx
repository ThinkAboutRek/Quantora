import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AUTH_BASE_URL, portfolioDetailUrl } from '../mocks/handlers';
import { server } from '../mocks/server';
import { AuthProvider } from '../features/auth/AuthProvider';
import { AppRoutes } from './AppRoutes';

const ME = `${AUTH_BASE_URL}/me/`;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AppRoutes (anonymous)', () => {
  // Settle the session probe as anonymous so the header is deterministic; this
  // also gives each test a stable signal (the "Log in" link) to await, which
  // flushes the provider's async state update inside `act`.
  beforeEach(() => {
    server.use(http.get(ME, () => new HttpResponse(null, { status: 401 })));
  });

  it('renders the landing page at the root route', async () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Quantora' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument();
  });

  it('renders the not-found page for an unknown route', async () => {
    renderAt('/no-such-page');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument();
  });

  it('wraps routed pages in the layout main landmark', async () => {
    renderAt('/');
    expect(screen.getByRole('main')).toBeInTheDocument();
    await screen.findByRole('link', { name: 'Log in' });
  });

  it('shows the login form on /login when anonymous', async () => {
    renderAt('/login');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('redirects /portfolios to /login when anonymous', async () => {
    renderAt('/portfolios');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('redirects a /portfolios detail route to /login when anonymous', async () => {
    renderAt('/portfolios/1');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('redirects /app to /login when anonymous', async () => {
    renderAt('/app');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('AppRoutes (authenticated)', () => {
  // The default `me` handler settles the probe as authenticated.

  it('renders the portfolios list at /portfolios', async () => {
    renderAt('/portfolios');
    expect(await screen.findByRole('heading', { name: 'Portfolios' })).toBeInTheDocument();
  });

  it('redirects /app to /portfolios (compatibility redirect)', async () => {
    renderAt('/app');
    expect(await screen.findByRole('heading', { name: 'Portfolios' })).toBeInTheDocument();
  });

  it('renders the portfolio detail page at /portfolios/:portfolioId', async () => {
    renderAt('/portfolios/1');
    expect(await screen.findByRole('heading', { name: 'Growth' })).toBeInTheDocument();
  });

  it('shows the neutral not-found state for a concealed 404 detail', async () => {
    server.use(
      http.get(portfolioDetailUrl(2), () =>
        HttpResponse.json({ detail: 'Not found.' }, { status: 404 }),
      ),
    );
    renderAt('/portfolios/2');

    expect(
      await screen.findByRole('heading', { name: 'Portfolio not found.' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/permission|owner|access|denied/i)).not.toBeInTheDocument();
  });
});
