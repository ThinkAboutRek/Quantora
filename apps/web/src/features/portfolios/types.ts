import { ApiError, ValidationError } from '../../api/http';

export interface Portfolio {
  id: number;
  name: string;
  base_currency: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

/** Which state the list endpoint should return. The page fetches exactly one
 *  state at a time; there is no combined view. */
export type PortfolioListFilter = 'active' | 'archived';

/**
 * True when a 400 is a lifecycle rejection — a non-field `detail` (e.g.
 * renaming an archived portfolio, deleting an active one) — rather than a
 * `name` field validation error. Builds directly on the http wrapper's
 * normalization: field errors land in `fieldErrors`, a non-field detail in
 * `detail`.
 */
export function isLifecycleError(error: ValidationError): boolean {
  return error.detail !== undefined && error.fieldErrors.name === undefined;
}

/** True when the request hit the concealed 404 — an id that either does not
 *  exist or is not owned by the current user; the two are indistinguishable. */
export function isNotFoundError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 404;
}
