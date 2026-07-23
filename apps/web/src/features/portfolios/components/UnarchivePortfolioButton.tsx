import { useRef, useState } from 'react';
import { unarchivePortfolio } from '../api';
import type { Portfolio } from '../types';

interface UnarchivePortfolioButtonProps {
  readonly portfolioId: number;
  /** Hand the authoritative restored record to the page to replace its state. */
  readonly onUnarchived: (portfolio: Portfolio) => void;
  /** Any failure is classified by the page (session expiry, CSRF, etc.). */
  readonly onError: (error: unknown) => void;
}

/**
 * Direct unarchive action — no modal. Mirrors `ArchivePortfolioButton`: a
 * synchronous in-flight guard plus the pending-disabled control prevent
 * duplicate POSTs, and the request is never auto-replayed on failure.
 */
export function UnarchivePortfolioButton({
  portfolioId,
  onUnarchived,
  onError,
}: UnarchivePortfolioButtonProps) {
  const [pending, setPending] = useState(false);
  const inFlightRef = useRef(false);

  async function handleClick() {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setPending(true);
    try {
      const restored = await unarchivePortfolio(portfolioId);
      onUnarchived(restored);
    } catch (error) {
      onError(error);
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className="portfolio-action"
      disabled={pending}
      onClick={() => void handleClick()}
    >
      {pending ? 'Restoring…' : 'Unarchive portfolio'}
    </button>
  );
}
