import { useRef, useState } from 'react';
import { archivePortfolio } from '../api';
import type { Portfolio } from '../types';

interface ArchivePortfolioButtonProps {
  readonly portfolioId: number;
  /** Hand the authoritative archived record to the page to replace its state. */
  readonly onArchived: (portfolio: Portfolio) => void;
  /** Any failure is classified by the page (session expiry, CSRF, etc.). */
  readonly onError: (error: unknown) => void;
}

/**
 * Direct archive action — no modal. A synchronous in-flight guard plus the
 * pending-disabled control ensure a double click can never fire two POSTs, and
 * the request is never auto-replayed on failure.
 */
export function ArchivePortfolioButton({
  portfolioId,
  onArchived,
  onError,
}: ArchivePortfolioButtonProps) {
  const [pending, setPending] = useState(false);
  const inFlightRef = useRef(false);

  async function handleClick() {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setPending(true);
    try {
      const archived = await archivePortfolio(portfolioId);
      onArchived(archived);
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
      {pending ? 'Archiving…' : 'Archive portfolio'}
    </button>
  );
}
