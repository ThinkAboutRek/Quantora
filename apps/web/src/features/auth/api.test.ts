import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { CsrfError } from '../../api/http';
import { clearCsrfToken, getCsrfToken, setCsrfToken } from '../../api/csrfToken';
import { AUTH_BASE_URL } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { bootstrapCsrf, ensureCsrfToken, fetchCurrentUser, login, logout, register } from './api';

const CSRF = `${AUTH_BASE_URL}/csrf/`;
const LOGIN = `${AUTH_BASE_URL}/login/`;
const REGISTER = `${AUTH_BASE_URL}/register/`;
const LOGOUT = `${AUTH_BASE_URL}/logout/`;

describe('ensureCsrfToken', () => {
  it('fetches and stores a token when none is held', async () => {
    expect(getCsrfToken()).toBeNull();
    const token = await ensureCsrfToken();
    expect(token).toBe('test-csrf-token');
    expect(getCsrfToken()).toBe('test-csrf-token');
  });

  it('returns the held token without fetching when one is present', async () => {
    setCsrfToken('already-held');
    // If a fetch happened, this override would replace the token with a different
    // value; asserting it stays "already-held" proves no request was made.
    server.use(http.get(CSRF, () => HttpResponse.json({ csrf_token: 'fetched-instead' })));
    const token = await ensureCsrfToken();
    expect(token).toBe('already-held');
    expect(getCsrfToken()).toBe('already-held');
  });

  it('re-fetches after the token is cleared', async () => {
    setCsrfToken('will-be-cleared');
    clearCsrfToken();
    server.use(http.get(CSRF, () => HttpResponse.json({ csrf_token: 'refetched' })));
    await expect(ensureCsrfToken()).resolves.toBe('refetched');
    expect(getCsrfToken()).toBe('refetched');
  });
});

describe('bootstrapCsrf', () => {
  it('forces a fetch even when a token is already held', async () => {
    setCsrfToken('stale');
    server.use(http.get(CSRF, () => HttpResponse.json({ csrf_token: 'forced' })));
    await expect(bootstrapCsrf()).resolves.toBe('forced');
    expect(getCsrfToken()).toBe('forced');
  });
});

describe('fetchCurrentUser', () => {
  it('returns the user on 200', async () => {
    await expect(fetchCurrentUser()).resolves.toEqual({ id: 1, email: 'user@example.com' });
  });

  it('propagates the thrown error on 401 for the caller to interpret', async () => {
    server.use(http.get(`${AUTH_BASE_URL}/me/`, () => new HttpResponse(null, { status: 401 })));
    await expect(fetchCurrentUser()).rejects.toMatchObject({ status: 401 });
  });
});

describe('login', () => {
  it('replaces the held token with the response token and returns the user', async () => {
    setCsrfToken('pre-login');
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json({ user: { id: 7, email: 'in@example.com' }, csrf_token: 'post-login' }),
      ),
    );
    const user = await login('in@example.com', 'password');
    expect(user).toEqual({ id: 7, email: 'in@example.com' });
    expect(getCsrfToken()).toBe('post-login');
  });

  it('bootstraps a token first when none is held, then adopts the response token', async () => {
    expect(getCsrfToken()).toBeNull();
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json({
          user: { id: 1, email: 'user@example.com' },
          csrf_token: 'after-login',
        }),
      ),
    );
    await login('user@example.com', 'password');
    expect(getCsrfToken()).toBe('after-login');
  });

  it('normalises a flat user payload', async () => {
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json({ id: 2, email: 'flat@example.com', csrf_token: 't' }),
      ),
    );
    await expect(login('flat@example.com', 'password')).resolves.toEqual({
      id: 2,
      email: 'flat@example.com',
    });
  });
});

describe('register', () => {
  it('replaces the held token with the response token and returns the user', async () => {
    server.use(
      http.post(REGISTER, () =>
        HttpResponse.json(
          { user: { id: 9, email: 'new@example.com' }, csrf_token: 'post-register' },
          { status: 201 },
        ),
      ),
    );
    const user = await register('new@example.com', 'password');
    expect(user).toEqual({ id: 9, email: 'new@example.com' });
    expect(getCsrfToken()).toBe('post-register');
  });
});

describe('logout', () => {
  it('resolves on a 204', async () => {
    setCsrfToken('token');
    await expect(logout()).resolves.toBeUndefined();
  });

  it('throws the typed CsrfError on a 403', async () => {
    setCsrfToken('token');
    server.use(
      http.post(LOGOUT, () =>
        HttpResponse.json({ detail: 'CSRF verification failed.' }, { status: 403 }),
      ),
    );
    await expect(logout()).rejects.toBeInstanceOf(CsrfError);
  });
});
