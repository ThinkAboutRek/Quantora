import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ValidationError, type FieldErrors } from '../../../api/http';
import { AUTH_MESSAGES, genericAuthErrorSummary } from '../authMessages';
import { safeReturnPath } from '../returnPath';
import { useAuth } from '../useAuth';

/** Sign-in form. Errors are surfaced generically so nothing reveals whether an
 *  email exists; the destination after success is the validated return path. */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorNonce, setErrorNonce] = useState(0);

  const summaryRef = useRef<HTMLDivElement>(null);
  // Synchronous guard against a double submit: a ref flips before React can
  // re-render the disabled button, closing the gap the `pending` state leaves.
  const submittingRef = useRef(false);

  // Move focus to the error summary whenever a new submit failure is recorded.
  useEffect(() => {
    if (errorNonce > 0) {
      summaryRef.current?.focus();
    }
  }, [errorNonce]);

  function reportFailure(nextSummary: string, nextFieldErrors: FieldErrors = {}) {
    setSummary(nextSummary);
    setFieldErrors(nextFieldErrors);
    setPassword('');
    setErrorNonce((nonce) => nonce + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }

    const clientErrors: FieldErrors = {};
    if (email.trim() === '') {
      clientErrors.email = ['Enter your email address.'];
    }
    if (password === '') {
      clientErrors.password = ['Enter your password.'];
    }
    if (Object.keys(clientErrors).length > 0) {
      reportFailure(AUTH_MESSAGES.fixErrorsBelow, clientErrors);
      return;
    }

    submittingRef.current = true;
    setPending(true);
    setSummary(null);
    setFieldErrors({});
    try {
      await login(email, password);
      const from = location.state ? (location.state as { from?: unknown }).from : undefined;
      navigate(safeReturnPath(from), { replace: true });
    } catch (error) {
      if (error instanceof ValidationError) {
        // Generic invalid-credentials message; do not infer which field is wrong.
        reportFailure(error.detail ?? AUTH_MESSAGES.invalidCredentials);
        return;
      }
      reportFailure(genericAuthErrorSummary(error));
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  const emailError = fieldErrors.email?.[0];
  const passwordError = fieldErrors.password?.[0];

  return (
    <section className="auth" aria-labelledby="login-heading">
      <h1 id="login-heading" className="auth__heading">
        Sign in
      </h1>

      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        {summary !== null && (
          <div className="auth-form__summary" role="alert" tabIndex={-1} ref={summaryRef}>
            {summary}
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={emailError !== undefined || undefined}
            aria-describedby={emailError !== undefined ? 'login-email-error' : undefined}
            disabled={pending}
          />
          {emailError !== undefined && (
            <p id="login-email-error" className="auth-field__error">
              {emailError}
            </p>
          )}
        </div>

        <div className="auth-field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={passwordError !== undefined || undefined}
            aria-describedby={passwordError !== undefined ? 'login-password-error' : undefined}
            disabled={pending}
          />
          {passwordError !== undefined && (
            <p id="login-password-error" className="auth-field__error">
              {passwordError}
            </p>
          )}
        </div>

        <div className="auth-form__status" role="status" aria-busy={pending}>
          {pending ? 'Signing in…' : ''}
        </div>

        <button type="submit" className="auth-form__submit" disabled={pending}>
          Sign in
        </button>
      </form>

      <p className="auth__alt">
        Need an account? <Link to="/register">Create one</Link>
      </p>
    </section>
  );
}
