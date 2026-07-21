// Small, shared notices the route guards show while the startup session probe
// is loading or has failed. Kept generic and safe: the error notice never
// reveals why the probe failed, and offers a retry rather than dead-ending.

interface SessionErrorNoticeProps {
  readonly onRetry: () => void;
}

/** Polite loading state shown while the session is being checked. */
export function SessionLoadingNotice() {
  return (
    <div className="session-notice" role="status">
      <p>Checking your session…</p>
    </div>
  );
}

/** Recoverable error state: the session could not be verified. */
export function SessionErrorNotice({ onRetry }: SessionErrorNoticeProps) {
  return (
    <div className="session-notice" role="alert">
      <h1 className="session-notice__title">We couldn’t verify your session</h1>
      <p>Please check your connection and try again.</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
