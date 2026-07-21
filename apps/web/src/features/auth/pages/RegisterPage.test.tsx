import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AUTH_BASE_URL } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import { AuthProvider } from '../AuthProvider';
import { RegisterPage } from './RegisterPage';

const ME = `${AUTH_BASE_URL}/me/`;
const REGISTER = `${AUTH_BASE_URL}/register/`;

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/app" element={<h1>App home</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  values: { email: string; password: string; confirm: string },
) {
  await user.type(screen.getByLabelText('Email'), values.email);
  await user.type(screen.getByLabelText('Password'), values.password);
  await user.type(screen.getByLabelText('Confirm password'), values.confirm);
}

describe('RegisterPage', () => {
  beforeEach(() => {
    server.use(http.get(ME, () => new HttpResponse(null, { status: 401 })));
  });

  it('renders accessible labelled fields with correct autocomplete', () => {
    renderRegister();
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
  });

  it('registers and navigates to the default return path', async () => {
    const user = userEvent.setup();
    renderRegister();
    await fillForm(user, {
      email: 'new@example.com',
      password: 'a-good-password',
      confirm: 'a-good-password',
    });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'App home' })).toBeInTheDocument();
  });

  it('does not call the API when the confirmation does not match', async () => {
    let registerCalls = 0;
    server.use(
      http.post(REGISTER, () => {
        registerCalls += 1;
        return HttpResponse.json(
          { user: { id: 1, email: 'new@example.com' }, csrf_token: 't' },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderRegister();
    await fillForm(user, {
      email: 'new@example.com',
      password: 'a-good-password',
      confirm: 'different-password',
    });
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('aria-invalid', 'true');
    expect(registerCalls).toBe(0);
    expect(screen.getByRole('alert')).toHaveFocus();
  });

  it('maps a duplicate-email 400 to the email field and preserves the email', async () => {
    server.use(
      http.post(REGISTER, () =>
        HttpResponse.json({ email: ['A user with this email already exists.'] }, { status: 400 }),
      ),
    );
    const user = userEvent.setup();
    renderRegister();
    await fillForm(user, {
      email: 'taken@example.com',
      password: 'a-good-password',
      confirm: 'a-good-password',
    });
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('A user with this email already exists.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveValue('taken@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Confirm password')).toHaveValue('');
  });

  it('maps a password-rule 400 to the password field', async () => {
    server.use(
      http.post(REGISTER, () =>
        HttpResponse.json({ password: ['This password is too common.'] }, { status: 400 }),
      ),
    );
    const user = userEvent.setup();
    renderRegister();
    await fillForm(user, {
      email: 'new@example.com',
      password: 'password',
      confirm: 'password',
    });
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('This password is too common.')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a generic throttling message on 429', async () => {
    server.use(
      http.post(REGISTER, () =>
        HttpResponse.json({ detail: 'Request was throttled.' }, { status: 429 }),
      ),
    );
    const user = userEvent.setup();
    renderRegister();
    await fillForm(user, {
      email: 'new@example.com',
      password: 'a-good-password',
      confirm: 'a-good-password',
    });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i);
  });

  it('requires all fields without calling the API', async () => {
    let registerCalls = 0;
    server.use(
      http.post(REGISTER, () => {
        registerCalls += 1;
        return HttpResponse.json(
          { user: { id: 1, email: 'x@y.co' }, csrf_token: 't' },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderRegister();
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter a password.')).toBeInTheDocument();
    expect(screen.getByText('Confirm your password.')).toBeInTheDocument();
    expect(registerCalls).toBe(0);
  });
});
