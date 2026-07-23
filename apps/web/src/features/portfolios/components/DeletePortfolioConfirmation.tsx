import { useEffect, useRef, useState } from 'react';
import { deletePortfolio } from '../api';
import type { Portfolio } from '../types';

interface DeletePortfolioConfirmationProps {
  /** The archived portfolio offered for permanent deletion. */
  readonly portfolio: Portfolio;
  /** Invoked after the 204: the page clears its state and navigates. */
  readonly onDeleted: () => void;
  /** Any failure is classified by the page (lifecycle 400, CSRF, etc.). */
  readonly onError: (error: unknown) => void;
}

/**
 * Inline permanent-delete flow — no dialog dependency and no native `<dialog>`.
 *
 * The confirmation region renders only after the user selects "Delete
 * permanently"; it names the portfolio, states plainly that deletion cannot be
 * undone, and offers explicit confirm and cancel buttons. Focus moves into the
 * region when it opens and returns to the trigger on cancel, so the flow is
 * fully keyboard accessible. The confirm request has a pending state, a
 * synchronous in-flight guard, and disabled controls, so a double activation
 * can never fire two DELETEs.
 */
export function DeletePortfolioConfirmation({
  portfolio,
  onDeleted,
  onError,
}: DeletePortfolioConfirmationProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  const regionRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Synchronous guard against a double activation, closing the gap before the
  // `pending` state disables the buttons on the next render.
  const inFlightRef = useRef(false);
  // Tracks whether the confirmation was open, so focus only returns to the
  // trigger after a cancel — never on initial mount.
  const wasConfirmingRef = useRef(false);

  // Move focus into the confirmation region when it appears, and back to the
  // trigger when a cancel closes it (the trigger only re-mounts on that render,
  // so the focus restore has to run after it, in this effect).
  useEffect(() => {
    if (confirming) {
      wasConfirmingRef.current = true;
      regionRef.current?.focus();
    } else if (wasConfirmingRef.current) {
      wasConfirmingRef.current = false;
      triggerRef.current?.focus();
    }
  }, [confirming]);

  function handleCancel() {
    setConfirming(false);
  }

  async function handleConfirm() {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setPending(true);
    try {
      await deletePortfolio(portfolio.id);
      // The page clears its detail state and navigates; this component unmounts.
      onDeleted();
    } catch (error) {
      onError(error);
      inFlightRef.current = false;
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="portfolio-action portfolio-action--danger"
        ref={triggerRef}
        onClick={() => setConfirming(true)}
      >
        Delete permanently
      </button>
    );
  }

  return (
    <div
      className="portfolio-delete-confirm"
      role="group"
      aria-label="Confirm permanent deletion"
      tabIndex={-1}
      ref={regionRef}
    >
      <p className="portfolio-delete-confirm__text">
        Permanently delete <strong>{portfolio.name}</strong>? This removes the portfolio and cannot
        be undone.
      </p>
      <div className="portfolio-delete-confirm__actions">
        <button
          type="button"
          className="portfolio-action portfolio-action--danger"
          disabled={pending}
          onClick={() => void handleConfirm()}
        >
          {pending ? 'Deleting…' : 'Delete permanently'}
        </button>
        <button
          type="button"
          className="portfolio-action"
          disabled={pending}
          onClick={handleCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
