import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../useAuth';
import { safeReturnPath } from '../returnPath';
import { SessionErrorNotice, SessionLoadingNotice } from './SessionStatusNotice';

/**
 * Guard for public-only routes (login, register).
 *
 * - `loading`       — show the loading notice.
 * - `error`         — show the recoverable session-check failure with a retry.
 * - `anonymous`     — render the nested route (the form).
 * - `authenticated` — redirect to the validated return path from router state,
 *                     or /app. The same validator is used in LoginPage so both
 *                     agree on the destination and the /app fallback.
 */
export function PublicOnlyRoute() {
  const { status, retrySessionRestore } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <SessionLoadingNotice />;
  }

  if (status === 'error') {
    return <SessionErrorNotice onRetry={retrySessionRestore} />;
  }

  if (status === 'authenticated') {
    const state = location.state as { from?: unknown } | null;
    return <Navigate to={safeReturnPath(state?.from)} replace />;
  }

  return <Outlet />;
}
