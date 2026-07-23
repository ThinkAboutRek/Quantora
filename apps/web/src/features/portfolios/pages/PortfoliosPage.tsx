import { useCallback, useEffect, useReducer, useState } from 'react';
import { AuthError, RequestAbortedError } from '../../../api/http';
import { useAuth } from '../../auth/useAuth';
import { listPortfolios } from '../api';
import { CreatePortfolioForm } from '../components/CreatePortfolioForm';
import { PortfolioList } from '../components/PortfolioList';
import type { Portfolio, PortfolioListFilter } from '../types';
import '../portfolios.css';

// The page owns all portfolio state through a small reducer with distinct,
// observable states per selection: `loading` (fetch in flight), `error` (a
// retryable list failure), and `ready` — which splits at render into the empty
// state and the loaded state by the length of the authoritative array. The
// Active/Archived selection is page-local: exactly one list is fetched at a
// time (the plain call for active, `?archived=true` for archived) and never
// both. The create sub-states (pending, validation error) live in the form the
// page composes, which is only offered on the active view because a new
// portfolio is always active. A 401 never lands here as "empty"; it triggers
// the session-expiry transition instead.
type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly portfolios: readonly Portfolio[] };

type ListAction =
  | { readonly type: 'loading' }
  | { readonly type: 'loaded'; readonly portfolios: readonly Portfolio[] }
  | { readonly type: 'error' }
  | { readonly type: 'prepend'; readonly portfolio: Portfolio };

function reducer(state: ListState, action: ListAction): ListState {
  switch (action.type) {
    case 'loading':
      return { status: 'loading' };
    case 'loaded':
      return { status: 'ready', portfolios: action.portfolios };
    case 'error':
      return { status: 'error' };
    case 'prepend':
      if (state.status !== 'ready') {
        return state;
      }
      // Prepend the authoritative returned record; no optimistic insert, no
      // re-fetch.
      return { status: 'ready', portfolios: [action.portfolio, ...state.portfolios] };
  }
}

export function PortfoliosPage() {
  const { handleSessionExpired } = useAuth();
  const [filter, setFilter] = useState<PortfolioListFilter>('active');
  const [state, dispatch] = useReducer(reducer, { status: 'loading' });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void (async () => {
      try {
        // Active uses the plain list call (the server default); archived asks
        // for exactly the archived list. Never both.
        const portfolios = await listPortfolios(
          filter === 'archived' ? 'archived' : undefined,
          controller.signal,
        );
        // A stale run (superseded by cleanup, e.g. StrictMode's second pass) or
        // an aborted signal must never write state.
        if (!active || controller.signal.aborted) {
          return;
        }
        dispatch({ type: 'loaded', portfolios });
      } catch (error) {
        if (!active || controller.signal.aborted || error instanceof RequestAbortedError) {
          return;
        }
        if (error instanceof AuthError) {
          // Session rejected mid-use: go anonymous and let ProtectedRoute
          // redirect, rather than rendering a misleading empty page.
          handleSessionExpired();
          return;
        }
        // Network failure, 5xx, or non-JSON: a safe, retryable error state.
        dispatch({ type: 'error' });
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [filter, reloadTick, handleSessionExpired]);

  const retry = useCallback(() => {
    // Reset to loading in the handler (not the effect body) so the effect never
    // calls setState synchronously, then re-run the fetch.
    dispatch({ type: 'loading' });
    setReloadTick((tick) => tick + 1);
  }, []);

  const selectFilter = useCallback(
    (next: PortfolioListFilter) => {
      if (next === filter) {
        return;
      }
      dispatch({ type: 'loading' });
      setFilter(next);
    },
    [filter],
  );

  const handleCreated = useCallback((portfolio: Portfolio) => {
    dispatch({ type: 'prepend', portfolio });
  }, []);

  const showingArchived = filter === 'archived';

  return (
    <section className="portfolios" aria-labelledby="portfolios-heading">
      <h1 id="portfolios-heading" className="portfolios__heading">
        Portfolios
      </h1>

      <div className="portfolios__filter" role="group" aria-label="Portfolio state">
        <button
          type="button"
          className="portfolios__filter-option"
          aria-pressed={!showingArchived}
          onClick={() => selectFilter('active')}
        >
          Active
        </button>
        <button
          type="button"
          className="portfolios__filter-option"
          aria-pressed={showingArchived}
          onClick={() => selectFilter('archived')}
        >
          Archived
        </button>
      </div>

      {state.status === 'loading' && (
        <p className="portfolios__status" role="status" aria-busy="true">
          {showingArchived ? 'Loading your archived portfolios…' : 'Loading your portfolios…'}
        </p>
      )}

      {state.status === 'error' && (
        <div className="portfolios__error" role="alert">
          <p>We couldn’t load your portfolios. Please try again.</p>
          <button type="button" className="portfolios__retry" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          {!showingArchived && (
            <CreatePortfolioForm
              onCreated={handleCreated}
              onSessionExpired={handleSessionExpired}
            />
          )}
          {state.portfolios.length === 0 ? (
            <p className="portfolios__empty">
              {showingArchived
                ? 'You don’t have any archived portfolios.'
                : 'You don’t have any portfolios yet. Create one above to get started.'}
            </p>
          ) : (
            <PortfolioList portfolios={state.portfolios} />
          )}
        </>
      )}
    </section>
  );
}
