import { LogoutButton } from '../features/auth/components/LogoutButton';
import { useAuth } from '../features/auth/useAuth';

/**
 * Minimal protected landing area. It confirms the signed-in identity and offers
 * a way to sign out. It deliberately carries no portfolio data, dashboard
 * metrics, charts, or transactions — those are later-phase concerns.
 */
export function AppHomePage() {
  const { user } = useAuth();

  return (
    <section className="app-home" aria-labelledby="app-home-heading">
      <h1 id="app-home-heading">Your account</h1>
      <p className="app-home__signed-in">
        {user !== null ? (
          <>
            You are signed in as <strong>{user.email}</strong>.
          </>
        ) : (
          'You are signed in.'
        )}
      </p>
      <LogoutButton />
    </section>
  );
}
