// Auth API calls layered over the http wrapper and the in-memory CSRF holder.
//
// Each function maps one lifecycle action to one (or, for unsafe actions, a
// CSRF-priming pair of) request(s). Token handling is explicit and local: there
// is no interceptor that silently injects or refreshes tokens. The register and
// login responses are normalised to a single `AuthUser` regardless of whether
// the backend nests the user under `user` or returns it flat alongside
// `csrf_token`.

import { ApiError, request } from '../../api/http';
import { getCsrfToken, setCsrfToken } from '../../api/csrfToken';
import type { AuthUser } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Pull the masked token out of a `{ csrf_token }` payload, or `null`. */
function extractToken(payload: unknown): string | null {
  if (isRecord(payload) && typeof payload.csrf_token === 'string') {
    return payload.csrf_token;
  }
  return null;
}

/** Normalise a login/register payload to an `AuthUser`, accepting both the
 *  nested (`{ user: { id, email } }`) and flat (`{ id, email }`) shapes. */
function normaliseUser(payload: unknown): AuthUser {
  const source = isRecord(payload) && isRecord(payload.user) ? payload.user : payload;
  if (isRecord(source) && typeof source.id === 'number' && typeof source.email === 'string') {
    return { id: source.id, email: source.email };
  }
  throw new ApiError(0, 'The authentication response was not in the expected shape.');
}

/**
 * Return the in-memory token if one is held; otherwise fetch, store, and return
 * a fresh one. This is intentionally not a generic cache or de-dup framework —
 * it is a single guard so unsafe calls can attach a token without every caller
 * bootstrapping first.
 */
export async function ensureCsrfToken(signal?: AbortSignal): Promise<string> {
  const existing = getCsrfToken();
  if (existing !== null) {
    return existing;
  }
  return bootstrapCsrf(signal);
}

/** Force a CSRF fetch and store the token, ignoring any held value. Used at
 *  startup and for best-effort re-bootstrap after logout or a CSRF failure. */
export async function bootstrapCsrf(signal?: AbortSignal): Promise<string> {
  const data = await request('auth/csrf/', { signal });
  const token = extractToken(data);
  if (token === null) {
    throw new ApiError(0, 'The CSRF response did not contain a token.');
  }
  setCsrfToken(token);
  return token;
}

/** GET the current user. Resolves with the user on 200; the caller interprets a
 *  thrown `AuthError` (401) versus any other thrown error. */
export async function fetchCurrentUser(signal?: AbortSignal): Promise<AuthUser> {
  const data = await request('auth/me/', { signal });
  return normaliseUser(data);
}

/** Log in, then adopt the fresh token from the response. */
export async function login(
  email: string,
  password: string,
  signal?: AbortSignal,
): Promise<AuthUser> {
  await ensureCsrfToken(signal);
  const data = await request('auth/login/', { method: 'POST', body: { email, password }, signal });
  const token = extractToken(data);
  if (token !== null) {
    setCsrfToken(token);
  }
  return normaliseUser(data);
}

/** Register (which also establishes the session), then adopt the fresh token. */
export async function register(
  email: string,
  password: string,
  signal?: AbortSignal,
): Promise<AuthUser> {
  await ensureCsrfToken(signal);
  const data = await request('auth/register/', {
    method: 'POST',
    body: { email, password },
    signal,
  });
  const token = extractToken(data);
  if (token !== null) {
    setCsrfToken(token);
  }
  return normaliseUser(data);
}

/**
 * Log out. Resolves on the 204. A 403 (a stale/failed CSRF token) propagates as
 * the typed `CsrfError` from the http layer so the provider can keep the user,
 * re-bootstrap the token, and prompt a retry — logout is never auto-replayed.
 */
export async function logout(signal?: AbortSignal): Promise<void> {
  await ensureCsrfToken(signal);
  await request('auth/logout/', { method: 'POST', signal });
}
