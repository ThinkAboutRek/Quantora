// Core types for the authentication feature.
//
// These describe only what a consumer of the auth context may see: the minimal
// user identity and the coarse session status. The masked CSRF token is
// deliberately absent — it lives in the in-memory holder (see api/csrfToken.ts)
// and is never exposed through the feature's public types.

/** The minimal authenticated identity the API returns from `me`/`login`. */
export interface AuthUser {
  readonly id: number;
  readonly email: string;
}

/**
 * Coarse session state a consumer can branch on:
 * - `loading`       — the startup session probe has not resolved yet;
 * - `authenticated` — a valid session with a known user;
 * - `anonymous`     — no session (a clean `401`, or after logout);
 * - `error`         — the session could not be determined (network/5xx/etc.).
 */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';

/** The public shape of the auth context. It exposes actions and derived state,
 *  never the token, cookies, or raw responses. */
export interface AuthContextValue {
  readonly user: AuthUser | null;
  readonly status: AuthStatus;
  readonly login: (email: string, password: string) => Promise<void>;
  readonly register: (email: string, password: string) => Promise<void>;
  readonly logout: () => Promise<void>;
  /** Re-run the concurrent startup probe (me + csrf), clearing the error. */
  readonly retrySessionRestore: () => void;
}
