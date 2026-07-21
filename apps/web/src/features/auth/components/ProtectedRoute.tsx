import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../useAuth';
import { SessionErrorNotice, SessionLoadingNotice } from './SessionStatusNotice';

/**
 * Guard for authenticated-only routes.
 *
 * - `loading`       — show the loading notice; do NOT redirect (avoids bouncing
 *                     to /login before the session is known).
 * - `error`         — show the recoverable session-check failure with a retry.
 * - `anonymous`     — redirect to /login, carrying the attempted internal
 *                     location in router state so login can return the user.
 * - `authenticated` — render the nested route.
 */
export function ProtectedRoute() {
  const { status, retrySessionRestore } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <SessionLoadingNotice />;
  }

  if (status === 'error') {
    return <SessionErrorNotice onRetry={retrySessionRestore} />;
  }

  if (status === 'anonymous') {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <Outlet />;
}
