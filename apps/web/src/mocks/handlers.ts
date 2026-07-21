import { http, HttpResponse } from 'msw';

// Default happy-path MSW handlers for the session-auth endpoints.
//
// The URLs are deterministic and absolute so they match the final URL the
// application's request builder produces. In tests, jsdom's document origin is
// pinned to `http://localhost:5173/` (see vite.config.ts) and the API base
// defaults to `/api/v1`, which the builder resolves against that origin — so
// every request lands on exactly one of the URLs registered here. Individual
// tests override a case with `server.use(...)`.

/** Absolute base every handler URL is built from — mirrors the URL builder. */
export const AUTH_BASE_URL = 'http://localhost:5173/api/v1/auth';

/** Deterministic token the default csrf/login/register handlers return. */
export const DEFAULT_CSRF_TOKEN = 'test-csrf-token';

/** Deterministic user the default me/login/register handlers return. */
export const DEFAULT_USER = { id: 1, email: 'user@example.com' } as const;

export const handlers = [
  http.get(`${AUTH_BASE_URL}/csrf/`, () => {
    return HttpResponse.json({ csrf_token: DEFAULT_CSRF_TOKEN });
  }),

  http.get(`${AUTH_BASE_URL}/me/`, () => {
    return HttpResponse.json(DEFAULT_USER);
  }),

  http.post(`${AUTH_BASE_URL}/register/`, () => {
    return HttpResponse.json(
      { user: DEFAULT_USER, csrf_token: DEFAULT_CSRF_TOKEN },
      { status: 201 },
    );
  }),

  http.post(`${AUTH_BASE_URL}/login/`, () => {
    return HttpResponse.json({ user: DEFAULT_USER, csrf_token: DEFAULT_CSRF_TOKEN });
  }),

  http.post(`${AUTH_BASE_URL}/logout/`, () => {
    return new HttpResponse(null, { status: 204 });
  }),
];
