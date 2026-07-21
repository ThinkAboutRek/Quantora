import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AUTH_BASE_URL } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import { AuthProvider } from '../AuthProvider';
import { LoginPage } from './LoginPage';

const ME = `${AUTH_BASE_URL}/me/`;
const LOGIN = `${AUTH_BASE_URL}/login/`;

interface Entry {
  readonly pathname: string;
  readonly state?: unknown;
}

function renderLogin(entry: Entry = { pathname: '/login' }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app" element={<h1>App home</h1>} />
          <Route path="/app/portfolio" element={<h1>Portfolio</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  // Settle the provider as anonymous so the form is the focus of each test.
  beforeEach(() => {
    server.use(http.get(ME, () => new HttpResponse(null, { status: 401 })));
  });

  it('renders accessible labelled fields and a submit control', () => {
    renderLogin();
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('logs in and navigates to the default return path', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'App home' })).toBeInTheDocument();
  });

  it('navigates to a valid internal return path from router state', async () => {
    const user = userEvent.setup();
    renderLogin({ pathname: '/login', state: { from: '/app/portfolio' } });
    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Portfolio' })).toBeInTheDocument();
  });

  it('shows a generic message on invalid credentials, clears the password, keeps the email', async () => {
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json({ detail: 'Invalid email or password.' }, { status: 400 }),
      ),
    );
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid email or password.');
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText('Email')).toHaveValue('user@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('shows a generic throttling message on 429', async () => {
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json({ detail: 'Request was throttled.' }, { status: 429 }),
      ),
    );
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i);
  });

  it('shows a generic connectivity message on a network failure', async () => {
    server.use(http.post(LOGIN, () => HttpResponse.error()));
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t reach the server/i);
  });

  it('validates required fields without calling the API and focuses the summary', async () => {
    let loginCalls = 0;
    server.use(
      http.post(LOGIN, () => {
        loginCalls += 1;
        return HttpResponse.json({ user: { id: 1, email: 'user@example.com' }, csrf_token: 't' });
      }),
    );
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(loginCalls).toBe(0);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('disables the button and marks the status busy while pending, and prevents duplicate submits', async () => {
    let loginCalls = 0;
    server.use(
      http.post(LOGIN, async () => {
        loginCalls += 1;
        await delay(40);
        return HttpResponse.json({ user: { id: 1, email: 'user@example.com' }, csrf_token: 't' });
      }),
    );
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');

    const submit = screen.getByRole('button', { name: 'Sign in' });
    const form = submit.closest('form') as HTMLFormElement;
    await user.click(submit);
    expect(submit).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Signing in…');

    // While the first request is provably in flight, a second submit fired
    // straight at the form (bypassing the disabled button) is rejected by the
    // synchronous in-flight guard.
    fireEvent.submit(form);

    expect(await screen.findByRole('heading', { name: 'App home' })).toBeInTheDocument();
    expect(loginCalls).toBe(1);
  });
});
