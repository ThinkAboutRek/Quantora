// Portfolio API calls layered over the shared http wrapper.
//
// These reuse the exact `request` helper the auth feature uses, so they inherit
// `credentials: "include"`, the CSRF header on unsafe methods, and the typed
// error normalization for free — there is no separate client here. Every unsafe
// call primes the CSRF token via `ensureCsrfToken` first, mirroring how the
// auth module guards its own unsafe requests, and never auto-replays after a
// 403. Callers branch on the typed errors from the http layer: the concealed
// 404 (`isNotFoundError`), session expiry (`AuthError`), CSRF (`CsrfError`),
// field vs lifecycle 400 (`ValidationError` + `isLifecycleError`), defensive
// 429 (`ThrottledError`), network (`NetworkError`), and 5xx / non-JSON
// (`ApiError`).

import { request } from '../../api/http';
import { ensureCsrfToken } from '../auth/api';
import type { Portfolio, PortfolioListFilter } from './types';

/**
 * GET the current user's portfolios as a plain array. With no `filter` the
 * plain collection URL is requested (the server's default is the active list);
 * an explicit selection sends `?archived=true` or `?archived=false`.
 */
export function listPortfolios(
  filter?: PortfolioListFilter,
  signal?: AbortSignal,
): Promise<Portfolio[]> {
  if (filter === undefined) {
    return request<Portfolio[]>('portfolios/', { signal });
  }
  const archived = filter === 'archived' ? 'true' : 'false';
  return request<Portfolio[]>(`portfolios/?archived=${archived}`, { signal });
}

/** GET one portfolio (active or archived) by id. */
export function getPortfolio(id: number, signal?: AbortSignal): Promise<Portfolio> {
  return request<Portfolio>(`portfolios/${id}/`, { signal });
}

/**
 * Create a portfolio with the given name. Ensures a CSRF token is held (fetching
 * one if needed) before the POST so the http layer can attach the header, then
 * returns the authoritative portfolio the server created.
 */
export async function createPortfolio(name: string, signal?: AbortSignal): Promise<Portfolio> {
  await ensureCsrfToken(signal);
  return request<Portfolio>('portfolios/', { method: 'POST', body: { name }, signal });
}

/** PATCH a portfolio's name. Only valid while active; an archived portfolio is
 *  rejected with a lifecycle 400. Returns the authoritative renamed record. */
export async function renamePortfolio(
  id: number,
  name: string,
  signal?: AbortSignal,
): Promise<Portfolio> {
  await ensureCsrfToken(signal);
  return request<Portfolio>(`portfolios/${id}/`, { method: 'PATCH', body: { name }, signal });
}

/** POST the archive action. Idempotent; returns the authoritative record. */
export async function archivePortfolio(id: number, signal?: AbortSignal): Promise<Portfolio> {
  await ensureCsrfToken(signal);
  return request<Portfolio>(`portfolios/${id}/archive/`, { method: 'POST', signal });
}

/** POST the unarchive action. Idempotent; returns the authoritative record. */
export async function unarchivePortfolio(id: number, signal?: AbortSignal): Promise<Portfolio> {
  await ensureCsrfToken(signal);
  return request<Portfolio>(`portfolios/${id}/unarchive/`, { method: 'POST', signal });
}

/**
 * DELETE a portfolio permanently. Only valid while archived; an active
 * portfolio is rejected with a lifecycle 400. Resolves on the empty 204 —
 * there is no body to parse.
 */
export async function deletePortfolio(id: number, signal?: AbortSignal): Promise<void> {
  await ensureCsrfToken(signal);
  await request<undefined>(`portfolios/${id}/`, { method: 'DELETE', signal });
}
