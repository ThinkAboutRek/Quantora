import { Link, Outlet } from 'react-router';
import { LogoutButton } from '../../features/auth/components/LogoutButton';
import { useAuth } from '../../features/auth/useAuth';
import '../../features/auth/auth.css';

/**
 * Shared application shell. The header is minimally auth-aware: it shows the
 * sign-in/register links only when the session is known to be anonymous, and the
 * signed-in identity plus a logout control only when authenticated. During the
 * startup `loading` and `error` states it shows neither, so the header stays
 * stable and never flashes the wrong links before the session is known.
 */
export function AppLayout() {
  const { status, user } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-header__brand">Quantora</span>
        <nav className="app-header__nav" aria-label="Account">
          {status === 'authenticated' && user !== null && (
            <span className="app-header__account">
              <span className="app-header__user">Signed in as {user.email}</span>
              <LogoutButton />
            </span>
          )}
          {status === 'anonymous' && (
            <>
              <Link to="/login">Log in</Link>
              <Link to="/register">Register</Link>
            </>
          )}
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <p className="app-footer__note">
          Quantora — educational portfolio analytics. Not investment advice.
        </p>
      </footer>
    </div>
  );
}
