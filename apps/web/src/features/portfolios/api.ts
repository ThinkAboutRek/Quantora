// Portfolio API calls layered over the shared http wrapper.
//
// These reuse the exact `request` helper the auth feature uses, so they inherit
// `credentials: "include"`, the CSRF header on unsafe methods, and the typed
// error normalization for free — there is no separate client here. The create
// call primes the CSRF token via `ensureCsrfToken` first, mirroring how the auth
// module guards its own unsafe requests, and never auto-replays on failure.

import { request } from '../../api/http';
import { ensureCsrfToken } from '../auth/api';
import type { Portfolio } from './types';

/** GET the current user's portfolios as a plain array. */
export function listPortfolios(signal?: AbortSignal): Promise<Portfolio[]> {
  return request<Portfolio[]>('portfolios/', { signal });
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
