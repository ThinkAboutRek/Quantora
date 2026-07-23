import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PORTFOLIO, portfolioDetailUrl } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import { DeletePortfolioConfirmation } from './DeletePortfolioConfirmation';

const DELETE_URL = portfolioDetailUrl(DEFAULT_PORTFOLIO.id);

const ARCHIVED = { ...DEFAULT_PORTFOLIO, is_archived: true };

function renderConfirmation(
  overrides: Partial<{ onDeleted: () => void; onError: (error: unknown) => void }> = {},
) {
  const handlers = { onDeleted: vi.fn(), onError: vi.fn(), ...overrides };
  render(<DeletePortfolioConfirmation portfolio={ARCHIVED} {...handlers} />);
  return handlers;
}

describe('DeletePortfolioConfirmation', () => {
  it('renders only the trigger until "Delete permanently" is selected', () => {
    renderConfirmation();

    expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Confirm permanent deletion' }),
    ).not.toBeInTheDocument();
  });

  it('opens the confirmation with the name, irreversible wording, and focus', async () => {
    renderConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    const region = screen.getByRole('group', { name: 'Confirm permanent deletion' });
    expect(region).toHaveFocus();
    expect(region).toHaveTextContent('Growth');
    expect(region).toHaveTextContent(/cannot\s+be undone/);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('cancel closes the confirmation and returns focus to the trigger', async () => {
    renderConfirmation();
    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.queryByRole('group', { name: 'Confirm permanent deletion' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toHaveFocus();
  });

  it('confirming fires one DELETE, shows pending, and reports success', async () => {
    let deleteCalls = 0;
    server.use(
      http.delete(DELETE_URL, async () => {
        deleteCalls += 1;
        await delay(40);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const onDeleted = vi.fn();
    renderConfirmation({ onDeleted });
    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    // Pending: both controls disabled, so a second activation is inert.
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Deleting…' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(deleteCalls).toBe(1);
  });

  it('routes a failure to onError and re-enables the controls', async () => {
    server.use(http.delete(DELETE_URL, () => new HttpResponse(null, { status: 500 })));
    const onError = vi.fn();
    renderConfirmation({ onError });
    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
});
