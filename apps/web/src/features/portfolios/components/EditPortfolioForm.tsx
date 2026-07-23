import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ApiError,
  AuthError,
  CsrfError,
  NetworkError,
  ThrottledError,
  ValidationError,
} from '../../../api/http';
import { clearCsrfToken } from '../../../api/csrfToken';
import { bootstrapCsrf } from '../../auth/api';
import { renamePortfolio } from '../api';
import { isLifecycleError, isNotFoundError, type Portfolio } from '../types';

interface EditPortfolioFormProps {
  /** The portfolio being renamed; the form is only rendered while it is active. */
  readonly portfolio: Portfolio;
  /** Hand the authoritative renamed portfolio to the page to replace its record. */
  readonly onRenamed: (portfolio: Portfolio) => void;
  /** Invoked on a 401 so the page can run the session-expiry transition. */
  readonly onSessionExpired: () => void;
  /** Invoked on the concealed 404 so the page can show its neutral state. */
  readonly onNotFound: () => void;
}

const MESSAGES = {
  csrfRetry: 'Your session could not be verified. Please try again.',
  throttled: 'Too many requests. Please wait a moment and try again.',
  connectivity: 'We couldn’t reach the server. Please check your connection and try again.',
  unexpected: 'Something went wrong. Please try again.',
  invalidName: 'Please check the name and try again.',
  lifecycle: 'Unarchive the portfolio before renaming it.',
} as const;

/** Map a non-field, non-auth error to safe copy that never echoes server text. */
function summariseError(error: unknown): string {
  if (error instanceof ThrottledError) {
    return MESSAGES.throttled;
  }
  if (error instanceof NetworkError) {
    return MESSAGES.connectivity;
  }
  if (error instanceof ApiError && error.status >= 500) {
    return MESSAGES.connectivity;
  }
  return MESSAGES.unexpected;
}

/**
 * Accessible single-field rename form, mirroring `CreatePortfolioForm`.
 *
 * The input starts at the current name. On a `name` field 400 the backend
 * message is shown on the field and in the error summary, the entered name is
 * preserved, and focus moves to the summary. A lifecycle 400 (the portfolio was
 * archived elsewhere) shows the lifecycle message in the summary only — it is
 * not a field error. On a 403 the user stays signed in: the stale CSRF token is
 * dropped, a fresh one is bootstrapped, and the user is asked to submit again —
 * the PATCH is never auto-replayed. On success the authoritative record is
 * handed upward.
 */
export function EditPortfolioForm({
  portfolio,
  onRenamed,
  onSessionExpired,
  onNotFound,
}: EditPortfolioFormProps) {
  const [name, setName] = useState(portfolio.name);
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [errorNonce, setErrorNonce] = useState(0);

  const summaryRef = useRef<HTMLDivElement>(null);
  // Synchronous guard against a double submit, closing the gap before the
  // `pending` state disables the button on the next render.
  const submittingRef = useRef(false);

  // Move focus to the error summary whenever a new submit failure is recorded.
  useEffect(() => {
    if (errorNonce > 0) {
      summaryRef.current?.focus();
    }
  }, [errorNonce]);

  function reportFailure(nextSummary: string, nextNameError: string | null = null) {
    setSummary(nextSummary);
    setNameError(nextNameError);
    setErrorNonce((nonce) => nonce + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setPending(true);
    setSummary(null);
    setNameError(null);
    try {
      const renamed = await renamePortfolio(portfolio.id, name);
      onRenamed(renamed);
    } catch (error) {
      if (error instanceof AuthError) {
        // The session is gone; let the page transition to anonymous and redirect.
        onSessionExpired();
        return;
      }
      if (error instanceof ValidationError) {
        if (isLifecycleError(error)) {
          // The portfolio was archived (e.g. in another tab): show the approved
          // lifecycle message as a summary, not a field error, and do not
          // navigate away.
          reportFailure(error.detail ?? MESSAGES.lifecycle);
          return;
        }
        // Surface the backend field message; keep the entered name for editing.
        const fieldMessage = error.fieldErrors.name?.[0] ?? error.detail ?? MESSAGES.invalidName;
        reportFailure(fieldMessage, fieldMessage);
        return;
      }
      if (error instanceof CsrfError) {
        // Keep the user signed in: drop the rejected token, re-prime a fresh one
        // in the background, and ask them to resubmit. Never auto-replay the PATCH.
        clearCsrfToken();
        void bootstrapCsrf().catch(() => undefined);
        reportFailure(MESSAGES.csrfRetry);
        return;
      }
      if (isNotFoundError(error)) {
        // Concealed 404: the portfolio no longer resolves for this user.
        onNotFound();
        return;
      }
      reportFailure(summariseError(error));
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  return (
    <form
      className="portfolio-form"
      noValidate
      onSubmit={handleSubmit}
      aria-label="Rename portfolio"
    >
      {summary !== null && (
        <div className="portfolio-form__summary" role="alert" tabIndex={-1} ref={summaryRef}>
          {summary}
        </div>
      )}

      <div className="portfolio-field">
        <label htmlFor="portfolio-rename">Portfolio name</label>
        <input
          id="portfolio-rename"
          name="name"
          type="text"
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={nameError !== null || undefined}
          aria-describedby={nameError !== null ? 'portfolio-rename-error' : undefined}
          disabled={pending}
        />
        {nameError !== null && (
          <p id="portfolio-rename-error" className="portfolio-field__error">
            {nameError}
          </p>
        )}
      </div>

      <div className="portfolio-form__status" role="status" aria-busy={pending}>
        {pending ? 'Renaming…' : ''}
      </div>

      <button type="submit" className="portfolio-form__submit" disabled={pending}>
        Rename portfolio
      </button>
    </form>
  );
}
