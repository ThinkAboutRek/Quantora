import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { getCsrfToken } from '../../../api/csrfToken';
import { AUTH_BASE_URL } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import { AuthProvider } from '../AuthProvider';
import { useAuth } from '../useAuth';
import { LogoutButton } from './LogoutButton';

const CSRF = `${AUTH_BASE_URL}/csrf/`;
const LOGOUT = `${AUTH_BASE_URL}/logout/`;

/** Surfaces provider state so logout's effect on user/status can be asserted. */
function Readout() {
  const { status, user } = useAuth();
  return (
    <p>
      readout: {status} / {user ? user.email : 'none'}
    </p>
  );
}

function renderLogout() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <AuthProvider>
        <Readout />
        <Routes>
          <Route path="/app" element={<LogoutButton />} />
          <Route path="/login" element={<h1>Login page</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LogoutButton', () => {
  it('waits for the 204 before navigating, then clears user and token', async () => {
    renderLogout();
    // Confirm the provider bootstrapped an authenticated session and a token.
    expect(
      await screen.findByText('readout: authenticated / user@example.com'),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    // Make the post-logout re-bootstrap fail so the cleared token stays cleared
    // and is observable.
    server.use(
      http.post(LOGOUT, async () => {
        await delay(30);
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(CSRF, () => HttpResponse.error()),
    );

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    // Still on /app while the logout is in flight.
    expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();

    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument();
    expect(screen.getByText('readout: anonymous / none')).toBeInTheDocument();
    expect(getCsrfToken()).toBeNull();
  });

  // Render the readout first so we can await the authenticated bootstrap.
  it('renders authenticated readout before interaction', async () => {
    renderLogout();
    expect(
      await screen.findByText('readout: authenticated / user@example.com'),
    ).toBeInTheDocument();
  });

  it('navigates even though the best-effort re-bootstrap has not resolved', async () => {
    renderLogout();
    await screen.findByText('readout: authenticated / user@example.com');

    const user = userEvent.setup();
    // A re-bootstrap that never resolves must not block navigation.
    server.use(http.get(CSRF, () => new Promise<Response>(() => {})));
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument();
  });

  it('keeps the user signed in and shows a retry on a 403, without replaying', async () => {
    renderLogout();
    await screen.findByText('readout: authenticated / user@example.com');

    let logoutCalls = 0;
    server.use(
      http.post(LOGOUT, () => {
        logoutCalls += 1;
        return HttpResponse.json({ detail: 'CSRF verification failed.' }, { status: 403 });
      }),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i);
    // Did not navigate and stayed authenticated.
    expect(screen.getByText('readout: authenticated / user@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Login page' })).not.toBeInTheDocument();
    // The button is usable again; logout was not auto-replayed.
    expect(screen.getByRole('button', { name: 'Log out' })).toBeEnabled();
    expect(logoutCalls).toBe(1);
  });

  it('disables the button and shows a pending label while signing out', async () => {
    renderLogout();
    await screen.findByText('readout: authenticated / user@example.com');

    const user = userEvent.setup();
    server.use(
      http.post(LOGOUT, async () => {
        await delay(40);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument();
  });
});
