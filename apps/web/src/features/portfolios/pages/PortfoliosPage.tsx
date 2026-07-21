import { useCallback, useEffect, useReducer, useState } from 'react';
import { AuthError, RequestAbortedError } from '../../../api/http';
import { useAuth } from '../../auth/useAuth';
import { listPortfolios } from '../api';
import { CreatePortfolioForm } from '../components/CreatePortfolioForm';
import { PortfolioList } from '../components/PortfolioList';
import type { Portfolio } from '../types';
import '../portfolios.css';

// The page owns all portfolio state through a small reducer with distinct,
// observable states: `loading` (initial fetch in flight), `error` (a retryable
// list failure), and `ready` — which splits at render into the empty state and
// the loaded-with-portfolios state by the length of the authoritative array. The
// create sub-states (pending, validation error) live in the form the page
// composes. A 401 never lands here as "empty"; it triggers the session-expiry
// transition instead.
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
  const [state, dispatch] = useReducer(reducer, { status: 'loading' });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void (async () => {
      try {
        const portfolios = await listPortfolios(controller.signal);
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
  }, [reloadTick, handleSessionExpired]);

  const retry = useCallback(() => {
    // Reset to loading in the handler (not the effect body) so the effect never
    // calls setState synchronously, then re-run the fetch.
    dispatch({ type: 'loading' });
    setReloadTick((tick) => tick + 1);
  }, []);

  const handleCreated = useCallback((portfolio: Portfolio) => {
    dispatch({ type: 'prepend', portfolio });
  }, []);

  return (
    <section className="portfolios" aria-labelledby="portfolios-heading">
      <h1 id="portfolios-heading" className="portfolios__heading">
        Portfolios
      </h1>

      {state.status === 'loading' && (
        <p className="portfolios__status" role="status" aria-busy="true">
          Loading your portfolios…
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
          <CreatePortfolioForm onCreated={handleCreated} onSessionExpired={handleSessionExpired} />
          {state.portfolios.length === 0 ? (
            <p className="portfolios__empty">
              You don’t have any portfolios yet. Create one above to get started.
            </p>
          ) : (
            <PortfolioList portfolios={state.portfolios} />
          )}
        </>
      )}
    </section>
  );
}
