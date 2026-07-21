import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ValidationError, type FieldErrors } from '../../../api/http';
import { AUTH_MESSAGES, genericAuthErrorSummary } from '../authMessages';
import { safeReturnPath } from '../returnPath';
import { useAuth } from '../useAuth';

/**
 * Registration form. Client validation is limited to required fields, basic
 * browser email validation, and a frontend-only password confirmation — it does
 * NOT duplicate Django's password rules, which are enforced server-side and
 * surfaced as field errors. On success the session is established automatically.
 */
export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorNonce, setErrorNonce] = useState(0);

  const summaryRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  // Synchronous guard against a double submit (see LoginPage for the rationale).
  const submittingRef = useRef(false);

  useEffect(() => {
    if (errorNonce > 0) {
      summaryRef.current?.focus();
    }
  }, [errorNonce]);

  function reportFailure(nextSummary: string, nextFieldErrors: FieldErrors = {}) {
    setSummary(nextSummary);
    setFieldErrors(nextFieldErrors);
    setPassword('');
    setConfirmPassword('');
    setErrorNonce((nonce) => nonce + 1);
  }

  function validateClient(): FieldErrors {
    const errors: FieldErrors = {};
    if (email.trim() === '') {
      errors.email = ['Enter your email address.'];
    } else if (emailRef.current?.validity.typeMismatch) {
      errors.email = ['Enter a valid email address.'];
    }
    if (password === '') {
      errors.password = ['Enter a password.'];
    }
    if (confirmPassword === '') {
      errors.confirmPassword = ['Confirm your password.'];
    } else if (password !== confirmPassword) {
      errors.confirmPassword = ['Passwords do not match.'];
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }

    const clientErrors = validateClient();
    if (Object.keys(clientErrors).length > 0) {
      // A confirmation mismatch (or any client error) must not reach the API.
      reportFailure(AUTH_MESSAGES.fixErrorsBelow, clientErrors);
      return;
    }

    submittingRef.current = true;
    setPending(true);
    setSummary(null);
    setFieldErrors({});
    try {
      await register(email, password);
      navigate(
        safeReturnPath(location.state ? (location.state as { from?: unknown }).from : undefined),
        { replace: true },
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        const mapped: FieldErrors = {};
        const summaryParts: string[] = [];
        for (const [key, messages] of Object.entries(error.fieldErrors)) {
          if (key === 'email' || key === 'password') {
            mapped[key] = messages;
          } else {
            summaryParts.push(...messages);
          }
        }
        const hasFieldErrors = Object.keys(mapped).length > 0;
        const summaryMessage =
          summaryParts[0] ??
          (hasFieldErrors
            ? AUTH_MESSAGES.fixErrorsBelow
            : (error.detail ?? AUTH_MESSAGES.unexpected));
        reportFailure(summaryMessage, mapped);
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
  const confirmError = fieldErrors.confirmPassword?.[0];

  return (
    <section className="auth" aria-labelledby="register-heading">
      <h1 id="register-heading" className="auth__heading">
        Create your account
      </h1>

      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        {summary !== null && (
          <div className="auth-form__summary" role="alert" tabIndex={-1} ref={summaryRef}>
            {summary}
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="register-email">Email</label>
          <input
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            ref={emailRef}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={emailError !== undefined || undefined}
            aria-describedby={emailError !== undefined ? 'register-email-error' : undefined}
            disabled={pending}
          />
          {emailError !== undefined && (
            <p id="register-email-error" className="auth-field__error">
              {emailError}
            </p>
          )}
        </div>

        <div className="auth-field">
          <label htmlFor="register-password">Password</label>
          <input
            id="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={passwordError !== undefined || undefined}
            aria-describedby={passwordError !== undefined ? 'register-password-error' : undefined}
            disabled={pending}
          />
          {passwordError !== undefined && (
            <p id="register-password-error" className="auth-field__error">
              {passwordError}
            </p>
          )}
        </div>

        <div className="auth-field">
          <label htmlFor="register-confirm-password">Confirm password</label>
          <input
            id="register-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-invalid={confirmError !== undefined || undefined}
            aria-describedby={
              confirmError !== undefined ? 'register-confirm-password-error' : undefined
            }
            disabled={pending}
          />
          {confirmError !== undefined && (
            <p id="register-confirm-password-error" className="auth-field__error">
              {confirmError}
            </p>
          )}
        </div>

        <div className="auth-form__status" role="status" aria-busy={pending}>
          {pending ? 'Creating your account…' : ''}
        </div>

        <button type="submit" className="auth-form__submit" disabled={pending}>
          Create account
        </button>
      </form>

      <p className="auth__alt">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </section>
  );
}
