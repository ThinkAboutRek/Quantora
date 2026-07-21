import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AUTH_BASE_URL, DEFAULT_USER } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import { AuthProvider } from '../AuthProvider';
import { ProtectedRoute } from './ProtectedRoute';

const ME = `${AUTH_BASE_URL}/me/`;

/** Shows the router state `from` so the redirect payload can be asserted. */
function LoginProbe() {
  const location = useLocation();
  const state = location.state as { from?: string } | null;
  return <div>Login page — from: {state?.from ?? 'none'}</div>;
}

function renderProtected(initialPath = '/app') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<h1>Protected content</h1>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('shows a loading notice while the session is being checked', async () => {
    server.use(
      http.get(ME, async () => {
        await delay(50);
        return HttpResponse.json(DEFAULT_USER);
      }),
    );
    renderProtected();
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
    expect(screen.queryByRole('heading', { name: 'Protected content' })).not.toBeInTheDocument();
    // Let it resolve so the delayed request does not leak past the test.
    expect(await screen.findByRole('heading', { name: 'Protected content' })).toBeInTheDocument();
  });

  it('renders the nested route when authenticated', async () => {
    renderProtected();
    expect(await screen.findByRole('heading', { name: 'Protected content' })).toBeInTheDocument();
  });

  it('redirects an anonymous user to /login carrying the attempted path', async () => {
    server.use(http.get(ME, () => new HttpResponse(null, { status: 401 })));
    renderProtected('/app');
    expect(await screen.findByText('Login page — from: /app')).toBeInTheDocument();
  });

  it('shows a recoverable error notice when the session check fails', async () => {
    server.use(http.get(ME, () => new HttpResponse(null, { status: 500 })));
    renderProtected();
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t verify your session');
    expect(screen.queryByRole('heading', { name: 'Protected content' })).not.toBeInTheDocument();
  });

  it('retries the session check from the error notice', async () => {
    server.use(http.get(ME, () => new HttpResponse(null, { status: 500 })));
    renderProtected();
    await screen.findByRole('alert');

    server.use(http.get(ME, () => HttpResponse.json(DEFAULT_USER)));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Protected content' })).toBeInTheDocument();
  });
});
