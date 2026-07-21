import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setCsrfToken } from './csrfToken';
import {
  ApiError,
  AuthError,
  CsrfError,
  NetworkError,
  RequestAbortedError,
  ThrottledError,
  ValidationError,
  request,
  resolveApiUrl,
} from './http';
import { AUTH_BASE_URL } from '../mocks/handlers';
import { server } from '../mocks/server';

const ME = `${AUTH_BASE_URL}/me/`;
const LOGIN = `${AUTH_BASE_URL}/login/`;
const LOGOUT = `${AUTH_BASE_URL}/logout/`;
const REGISTER = `${AUTH_BASE_URL}/register/`;

// Restore any fetch spy after each test; MSW-only tests have no mocks to undo.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveApiUrl', () => {
  it('resolves a root-relative base against the document origin', () => {
    expect(resolveApiUrl('/api/v1', 'auth/csrf/')).toBe('http://localhost:5173/api/v1/auth/csrf/');
  });

  it('resolves an absolute base', () => {
    expect(resolveApiUrl('https://api.example.com/api/v1', 'auth/login/')).toBe(
      'https://api.example.com/api/v1/auth/login/',
    );
  });

  it('normalises the base to exactly one trailing slash', () => {
    expect(resolveApiUrl('/api/v1/', 'auth/me/')).toBe('http://localhost:5173/api/v1/auth/me/');
    expect(resolveApiUrl('https://api.example.com/api/v1///', 'auth/me/')).toBe(
      'https://api.example.com/api/v1/auth/me/',
    );
  });

  it('strips leading slashes from the path and preserves the trailing slash', () => {
    expect(resolveApiUrl('/api/v1', '/auth/csrf/')).toBe('http://localhost:5173/api/v1/auth/csrf/');
  });
});

describe('request — transport and headers', () => {
  it('always sends credentials', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await request('auth/me/');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[1]?.credentials).toBe('include');
  });

  it('resolves the path to an absolute URL before fetching', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    await request('auth/logout/', { method: 'POST' });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:5173/api/v1/auth/logout/');
  });

  it('attaches X-CSRFToken on unsafe methods', async () => {
    setCsrfToken('token-123');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    await request('auth/logout/', { method: 'POST' });
    const headers = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
    expect(headers.get('X-CSRFToken')).toBe('token-123');
  });

  it('omits X-CSRFToken on safe methods', async () => {
    setCsrfToken('token-123');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await request('auth/me/');
    const headers = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
    expect(headers.has('X-CSRFToken')).toBe(false);
  });

  it('sets a JSON Content-Type and serialises the body when a body is sent', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 1, email: 'a@b.co' }, csrf_token: 'x' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await request('auth/login/', { method: 'POST', body: { email: 'a@b.co', password: 'pw' } });
    const init = fetchSpy.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(init?.body).toBe(JSON.stringify({ email: 'a@b.co', password: 'pw' }));
  });

  it('sends no JSON Content-Type when there is no body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await request('auth/me/');
    expect(new Headers(fetchSpy.mock.calls[0]?.[1]?.headers).has('Content-Type')).toBe(false);
  });
});

describe('request — response handling', () => {
  it('parses a 200 JSON response', async () => {
    await expect(request('auth/csrf/')).resolves.toEqual({ csrf_token: 'test-csrf-token' });
  });

  it('parses a 201 JSON response', async () => {
    await expect(
      request('auth/register/', { method: 'POST', body: { email: 'a@b.co', password: 'pw' } }),
    ).resolves.toEqual({
      user: { id: 1, email: 'user@example.com' },
      csrf_token: 'test-csrf-token',
    });
  });

  it('returns undefined for a 204 response without parsing', async () => {
    await expect(request('auth/logout/', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('throws ValidationError carrying field errors on 400', async () => {
    server.use(
      http.post(REGISTER, () =>
        HttpResponse.json(
          {
            email: ['A user with this email already exists.'],
            password: ['This password is too common.'],
          },
          { status: 400 },
        ),
      ),
    );
    const error = await request('auth/register/', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors).toEqual({
      email: ['A user with this email already exists.'],
      password: ['This password is too common.'],
    });
  });

  it('throws ValidationError carrying the generic detail on a 400 detail body', async () => {
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json({ detail: 'Invalid email or password.' }, { status: 400 }),
      ),
    );
    const error = await request('auth/login/', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).detail).toBe('Invalid email or password.');
    expect((error as ValidationError).fieldErrors).toEqual({});
  });

  it('throws AuthError on 401', async () => {
    server.use(
      http.get(ME, () =>
        HttpResponse.json(
          { detail: 'Authentication credentials were not provided.' },
          { status: 401 },
        ),
      ),
    );
    await expect(request('auth/me/')).rejects.toBeInstanceOf(AuthError);
  });

  it('throws CsrfError on 403', async () => {
    server.use(
      http.post(LOGOUT, () =>
        HttpResponse.json({ detail: 'CSRF verification failed.' }, { status: 403 }),
      ),
    );
    await expect(request('auth/logout/', { method: 'POST' })).rejects.toBeInstanceOf(CsrfError);
  });

  it('throws ThrottledError and reads an integer Retry-After on 429', async () => {
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json(
          { detail: 'Request was throttled.' },
          { status: 429, headers: { 'Retry-After': '42' } },
        ),
      ),
    );
    const error = await request('auth/login/', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ThrottledError);
    expect((error as ThrottledError).retryAfterSeconds).toBe(42);
  });

  it('leaves retryAfterSeconds null when Retry-After is absent or non-integer', async () => {
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json(
          { detail: 'Request was throttled.' },
          { status: 429, headers: { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' } },
        ),
      ),
    );
    const error = await request('auth/login/', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    );
    expect((error as ThrottledError).retryAfterSeconds).toBeNull();
  });

  it('throws a generic ApiError for an unexpected status', async () => {
    server.use(http.get(ME, () => HttpResponse.json({ detail: 'Server error.' }, { status: 500 })));
    const error = await request('auth/me/').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
  });

  it('handles a non-JSON error body without retaining the raw markup', async () => {
    server.use(
      http.get(
        ME,
        () =>
          new HttpResponse('<html><body>Internal Server Error</body></html>', {
            status: 500,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    );
    const error = await request('auth/me/').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
    expect((error as ApiError).message).not.toContain('<html');
    expect((error as ApiError).message).not.toContain('Internal Server Error');
  });
});

describe('request — transport failures', () => {
  it('throws NetworkError when fetch rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(request('auth/me/')).rejects.toBeInstanceOf(NetworkError);
  });

  it('throws RequestAbortedError when the request is aborted', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('The operation was aborted.', 'AbortError'),
    );
    await expect(request('auth/me/')).rejects.toBeInstanceOf(RequestAbortedError);
  });
});
