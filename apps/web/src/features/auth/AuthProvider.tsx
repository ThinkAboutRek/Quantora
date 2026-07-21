import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthError, CsrfError, RequestAbortedError } from '../../api/http';
import { clearCsrfToken } from '../../api/csrfToken';
import {
  bootstrapCsrf,
  fetchCurrentUser,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
} from './api';
import { AuthContext } from './AuthContext';
import type { AuthContextValue, AuthStatus, AuthUser } from './types';

interface AuthProviderProps {
  readonly children: ReactNode;
}

/**
 * Holds the session state for the app and runs the startup session probe.
 *
 * On mount (and on `retrySessionRestore`) it fires `me` and `csrf` concurrently:
 * `me` alone decides the status (authenticated / anonymous / error), while
 * `csrf` only primes the in-memory token — a CSRF failure never downgrades an
 * authenticated session. Every probe carries an abort signal; on cleanup the
 * requests are aborted and their (aborted or late) results are ignored, so
 * React 19 StrictMode's double-invocation in development is harmless.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [restoreTick, setRestoreTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void (async () => {
      // `csrf` runs alongside `me` but its result is intentionally dropped here:
      // `bootstrapCsrf` stores the token itself on success, and a failure must
      // not affect auth status.
      const [meResult] = await Promise.allSettled([
        fetchCurrentUser(controller.signal),
        bootstrapCsrf(controller.signal),
      ]);

      // A stale run (superseded by cleanup, e.g. StrictMode's second pass) or an
      // aborted signal must never write state.
      if (!active || controller.signal.aborted) {
        return;
      }

      if (meResult.status === 'fulfilled') {
        setUser(meResult.value);
        setStatus('authenticated');
        return;
      }

      const reason: unknown = meResult.reason;
      if (reason instanceof RequestAbortedError) {
        return;
      }
      if (reason instanceof AuthError) {
        setUser(null);
        setStatus('anonymous');
        return;
      }
      // Network failure, 5xx, non-JSON, or any unexpected status: the session
      // could not be determined, so surface a recoverable error rather than a
      // false "anonymous" (which would wrongly bounce the user to /login).
      setUser(null);
      setStatus('error');
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [restoreTick]);

  const retrySessionRestore = useCallback(() => {
    // Reset to loading here (in the handler) rather than inside the effect, so
    // the effect never calls setState synchronously in its body. On first mount
    // the initial status is already 'loading'.
    setStatus('loading');
    setRestoreTick((tick) => tick + 1);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const authedUser = await apiLogin(email, password);
    setUser(authedUser);
    setStatus('authenticated');
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const authedUser = await apiRegister(email, password);
    setUser(authedUser);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch (error) {
      if (error instanceof CsrfError) {
        // The held token was rejected: drop it and re-prime a fresh one in the
        // background, but keep the user signed in and let the caller show a
        // generic retry. Logout is never auto-replayed.
        clearCsrfToken();
        void bootstrapCsrf().catch(() => undefined);
      }
      throw error;
    }
    // 204: the session is gone. Clear the token, go anonymous, and re-prime a
    // fresh CSRF token in the background without blocking the caller's navigate.
    clearCsrfToken();
    setUser(null);
    setStatus('anonymous');
    void bootstrapCsrf().catch(() => undefined);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout, retrySessionRestore }),
    [user, status, login, register, logout, retrySessionRestore],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
