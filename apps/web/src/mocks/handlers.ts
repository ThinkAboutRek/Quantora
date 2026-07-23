import { http, HttpResponse } from 'msw';

// Default happy-path MSW handlers for the session-auth and portfolio endpoints.
//
// The URLs are deterministic and absolute so they match the final URL the
// application's request builder produces. In tests, jsdom's document origin is
// pinned to `http://localhost:5173/` (see vite.config.ts) and the API base
// defaults to `/api/v1`, which the builder resolves against that origin — so
// every request lands on exactly one of the URLs registered here. Individual
// tests override a case with `server.use(...)`.

/** Absolute base every handler URL is built from — mirrors the URL builder. */
export const AUTH_BASE_URL = 'http://localhost:5173/api/v1/auth';

/** Absolute URL of the portfolio collection endpoint. */
export const PORTFOLIOS_URL = 'http://localhost:5173/api/v1/portfolios/';

/** Absolute URL of one portfolio's detail endpoint. */
export function portfolioDetailUrl(id: number | string): string {
  return `${PORTFOLIOS_URL}${id}/`;
}

/** Absolute URL of one portfolio's archive action. */
export function portfolioArchiveUrl(id: number | string): string {
  return `${PORTFOLIOS_URL}${id}/archive/`;
}

/** Absolute URL of one portfolio's unarchive action. */
export function portfolioUnarchiveUrl(id: number | string): string {
  return `${PORTFOLIOS_URL}${id}/unarchive/`;
}

/** Deterministic token the default csrf/login/register handlers return. */
export const DEFAULT_CSRF_TOKEN = 'test-csrf-token';

/** Deterministic user the default me/login/register handlers return. */
export const DEFAULT_USER = { id: 1, email: 'user@example.com' } as const;

/** Deterministic active portfolio the default create/detail handlers return. */
export const DEFAULT_PORTFOLIO = {
  id: 1,
  name: 'Growth',
  base_currency: 'USD',
  is_archived: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as const;

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

  // The list endpoint serves both states: the default (no filter or
  // `archived=false`) is the empty active list, and `archived=true` is the
  // empty archived list. Tests override with populated arrays per case.
  http.get(PORTFOLIOS_URL, () => {
    return HttpResponse.json([]);
  }),

  http.post(PORTFOLIOS_URL, () => {
    return HttpResponse.json(DEFAULT_PORTFOLIO, { status: 201 });
  }),

  http.get(portfolioDetailUrl(DEFAULT_PORTFOLIO.id), () => {
    return HttpResponse.json(DEFAULT_PORTFOLIO);
  }),

  http.patch(portfolioDetailUrl(DEFAULT_PORTFOLIO.id), () => {
    return HttpResponse.json(DEFAULT_PORTFOLIO);
  }),

  http.delete(portfolioDetailUrl(DEFAULT_PORTFOLIO.id), () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(portfolioArchiveUrl(DEFAULT_PORTFOLIO.id), () => {
    return HttpResponse.json({ ...DEFAULT_PORTFOLIO, is_archived: true });
  }),

  http.post(portfolioUnarchiveUrl(DEFAULT_PORTFOLIO.id), () => {
    return HttpResponse.json({ ...DEFAULT_PORTFOLIO, is_archived: false });
  }),
];
