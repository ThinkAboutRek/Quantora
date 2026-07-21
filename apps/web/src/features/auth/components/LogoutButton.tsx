import { useState } from 'react';
import { useNavigate } from 'react-router';
import { genericAuthErrorSummary } from '../authMessages';
import { useAuth } from '../useAuth';

/**
 * Sign-out control. It awaits the logout, then navigates: only a confirmed 204
 * (the provider has cleared the token and gone anonymous) leads to /login. A 403
 * or any other failure keeps the user signed in and shows a generic retry
 * message — logout is never auto-replayed.
 */
export function LogoutButton() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (caught) {
      setError(genericAuthErrorSummary(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="logout">
      {error !== null && (
        <p className="logout__error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="logout__button" onClick={handleClick} disabled={pending}>
        {pending ? 'Signing out…' : 'Log out'}
      </button>
    </div>
  );
}
