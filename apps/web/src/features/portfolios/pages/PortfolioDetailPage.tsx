import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ApiError,
  AuthError,
  CsrfError,
  NetworkError,
  RequestAbortedError,
  ThrottledError,
  ValidationError,
} from '../../../api/http';
import { clearCsrfToken } from '../../../api/csrfToken';
import { bootstrapCsrf } from '../../auth/api';
import { useAuth } from '../../auth/useAuth';
import { getPortfolio } from '../api';
import { ArchivePortfolioButton } from '../components/ArchivePortfolioButton';
import { DeletePortfolioConfirmation } from '../components/DeletePortfolioConfirmation';
import { EditPortfolioForm } from '../components/EditPortfolioForm';
import { UnarchivePortfolioButton } from '../components/UnarchivePortfolioButton';
import { isLifecycleError, isNotFoundError, type Portfolio } from '../types';
import '../portfolios.css';

// Detail state: `loading` (initial fetch in flight), `notFound` (the concealed
// 404 — nonexistent and non-owned ids are indistinguishable, and the copy is
// deliberately neutral), `error` (retryable fetch failure), and `ready` with
// the authoritative record. Mutations never update optimistically: the record
// is replaced only from the server's 200 (rename/archive/unarchive) and a 204
// delete clears the state and navigates back to the list.
type DetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'notFound' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly portfolio: Portfolio };

const MESSAGES = {
  csrfRetry: 'Your session could not be verified. Please try again.',
  throttled: 'Too many requests. Please wait a moment and try again.',
  connectivity: 'We couldn’t reach the server. Please check your connection and try again.',
  unexpected: 'Something went wrong. Please try again.',
} as const;

/** Parse the route parameter into a positive integer id, or null. A malformed
 *  id is treated exactly like the concealed 404 — no request is made. */
function parsePortfolioId(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return null;
  }
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Render an ISO timestamp for display; the raw value is already ISO-8601. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function PortfolioDetailPage() {
  const { portfolioId } = useParams();
  const navigate = useNavigate();
  const { handleSessionExpired } = useAuth();

  const id = parsePortfolioId(portfolioId);
  const [state, setState] = useState<DetailState>(
    id === null ? { status: 'notFound' } : { status: 'loading' },
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (id === null) {
      return;
    }
    const controller = new AbortController();
    let active = true;

    void (async () => {
      try {
        const portfolio = await getPortfolio(id, controller.signal);
        // A stale run (superseded by cleanup, e.g. StrictMode's second pass) or
        // an aborted signal must never write state.
        if (!active || controller.signal.aborted) {
          return;
        }
        setState({ status: 'ready', portfolio });
      } catch (error) {
        if (!active || controller.signal.aborted || error instanceof RequestAbortedError) {
          return;
        }
        if (error instanceof AuthError) {
          handleSessionExpired();
          return;
        }
        if (isNotFoundError(error)) {
          setState({ status: 'notFound' });
          return;
        }
        // Network failure, 5xx, or non-JSON: a safe, retryable error state.
        setState({ status: 'error' });
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, reloadTick, handleSessionExpired]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setReloadTick((tick) => tick + 1);
  }, []);

  /** Replace the record from an authoritative mutation response — never before. */
  const replacePortfolio = useCallback((portfolio: Portfolio) => {
    setActionError(null);
    setState({ status: 'ready', portfolio });
  }, []);

  const handleNotFound = useCallback(() => {
    setState({ status: 'notFound' });
  }, []);

  /** Classify a failed archive/unarchive/delete action into page-level state.
   *  Nothing is auto-replayed, and no server content beyond the known-safe
   *  lifecycle `detail` is ever rendered. */
  const handleActionError = useCallback(
    (error: unknown) => {
      if (error instanceof AuthError) {
        handleSessionExpired();
        return;
      }
      if (error instanceof ValidationError && isLifecycleError(error)) {
        // Lifecycle 400 (e.g. delete-while-active): show the approved message
        // and stay on the page.
        setActionError(error.detail ?? MESSAGES.unexpected);
        return;
      }
      if (error instanceof CsrfError) {
        // Keep the user signed in: drop the rejected token, re-prime a fresh one
        // in the background, and ask them to retry. Never auto-replay.
        clearCsrfToken();
        void bootstrapCsrf().catch(() => undefined);
        setActionError(MESSAGES.csrfRetry);
        return;
      }
      if (isNotFoundError(error)) {
        setState({ status: 'notFound' });
        return;
      }
      if (error instanceof ThrottledError) {
        setActionError(MESSAGES.throttled);
        return;
      }
      if (error instanceof NetworkError || (error instanceof ApiError && error.status >= 500)) {
        setActionError(MESSAGES.connectivity);
        return;
      }
      setActionError(MESSAGES.unexpected);
    },
    [handleSessionExpired],
  );

  const handleDeleted = useCallback(() => {
    // 204: clear local detail state and return to the list, which fetches
    // authoritative active data on mount.
    setState({ status: 'notFound' });
    setActionError(null);
    void navigate('/portfolios');
  }, [navigate]);

  return (
    <section className="portfolio-detail" aria-labelledby="portfolio-detail-heading">
      {state.status === 'loading' && (
        <p className="portfolios__status" role="status" aria-busy="true">
          Loading portfolio…
        </p>
      )}

      {state.status === 'notFound' && (
        <>
          <h1 id="portfolio-detail-heading" className="portfolios__heading">
            Portfolio not found.
          </h1>
          <p>
            <Link to="/portfolios">Back to portfolios</Link>
          </p>
        </>
      )}

      {state.status === 'error' && (
        <div className="portfolios__error" role="alert">
          <p>We couldn’t load this portfolio. Please try again.</p>
          <button type="button" className="portfolios__retry" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <h1 id="portfolio-detail-heading" className="portfolios__heading">
            {state.portfolio.name}
          </h1>

          {actionError !== null && (
            <div className="portfolio-form__summary" role="alert">
              {actionError}
            </div>
          )}

          <dl className="portfolio-detail__facts">
            <div className="portfolio-detail__fact">
              <dt>Status</dt>
              <dd>{state.portfolio.is_archived ? 'Archived' : 'Active'}</dd>
            </div>
            <div className="portfolio-detail__fact">
              <dt>Base currency</dt>
              <dd>{state.portfolio.base_currency}</dd>
            </div>
            <div className="portfolio-detail__fact">
              <dt>Created</dt>
              <dd>{formatTimestamp(state.portfolio.created_at)}</dd>
            </div>
            <div className="portfolio-detail__fact">
              <dt>Updated</dt>
              <dd>{formatTimestamp(state.portfolio.updated_at)}</dd>
            </div>
          </dl>

          {state.portfolio.is_archived ? (
            // Archived: restore or permanently delete. Rename is never offered.
            <div className="portfolio-detail__actions">
              <UnarchivePortfolioButton
                portfolioId={state.portfolio.id}
                onUnarchived={replacePortfolio}
                onError={handleActionError}
              />
              <DeletePortfolioConfirmation
                portfolio={state.portfolio}
                onDeleted={handleDeleted}
                onError={handleActionError}
              />
            </div>
          ) : (
            // Active: rename or archive. Permanent delete is never offered.
            <div className="portfolio-detail__actions">
              <EditPortfolioForm
                portfolio={state.portfolio}
                onRenamed={replacePortfolio}
                onSessionExpired={handleSessionExpired}
                onNotFound={handleNotFound}
              />
              <ArchivePortfolioButton
                portfolioId={state.portfolio.id}
                onArchived={replacePortfolio}
                onError={handleActionError}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
