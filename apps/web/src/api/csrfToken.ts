// In-memory holder for the masked CSRF token the API returns.
//
// The token lives only in this module-scoped variable for the lifetime of the
// page. It is deliberately NOT persisted (no localStorage/sessionStorage), NOT
// derived from or written to any cookie, never logged, and never exposed
// through React context or state — so reading or writing it cannot trigger a
// render. The readable `csrftoken` cookie remains the source of truth in the
// browser; this holder just carries the masked value the server handed us so we
// can echo it back in the `X-CSRFToken` header on unsafe requests.

let csrfToken: string | null = null;

/** Return the currently held masked CSRF token, or `null` if none is held. */
export function getCsrfToken(): string | null {
  return csrfToken;
}

/** Replace the held token with a freshly issued masked value. */
export function setCsrfToken(token: string): void {
  csrfToken = token;
}

/** Forget the held token. Used on logout and to reset state between tests. */
export function clearCsrfToken(): void {
  csrfToken = null;
}
