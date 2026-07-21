// Safe, generic user-facing copy for the auth forms, plus a mapper from the
// http layer's typed errors to a top-level summary message.
//
// Every message here is deliberately generic: it never reveals whether an email
// exists, why a CSRF check failed, or what a throttle scope/rate is. Field-level
// server messages (e.g. password rules, duplicate email) are surfaced separately
// by the register form; this module covers the non-field cases both forms share.

import { ApiError, CsrfError, NetworkError, ThrottledError } from '../../api/http';

export const AUTH_MESSAGES = {
  /** Login 400 fallback when the backend sends no detail (e.g. a non-JSON body). */
  invalidCredentials: 'Invalid email or password.',
  tooManyAttempts: 'Too many attempts. Please wait a moment before trying again.',
  csrfRetry: 'Your session could not be verified. Please try again.',
  connectivity: 'We couldn’t reach the server. Please check your connection and try again.',
  unexpected: 'Something went wrong. Please try again.',
  fixErrorsBelow: 'Please fix the errors below and try again.',
} as const;

/**
 * Map a non-validation error to a safe, generic summary. Callers handle the 400
 * `ValidationError` themselves (login → generic credentials message; register →
 * field errors); everything else — throttle, CSRF, network, 5xx, non-JSON — maps
 * here without leaking any server detail.
 */
export function genericAuthErrorSummary(error: unknown): string {
  if (error instanceof ThrottledError) {
    return AUTH_MESSAGES.tooManyAttempts;
  }
  if (error instanceof CsrfError) {
    return AUTH_MESSAGES.csrfRetry;
  }
  if (error instanceof NetworkError) {
    return AUTH_MESSAGES.connectivity;
  }
  if (error instanceof ApiError && error.status >= 500) {
    return AUTH_MESSAGES.connectivity;
  }
  return AUTH_MESSAGES.unexpected;
}
