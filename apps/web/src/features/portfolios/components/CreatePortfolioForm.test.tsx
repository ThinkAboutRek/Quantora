import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AUTH_BASE_URL, PORTFOLIOS_URL } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import { CreatePortfolioForm } from './CreatePortfolioForm';
import type { Portfolio } from '../types';

const CSRF = `${AUTH_BASE_URL}/csrf/`;

const RETIREMENT: Portfolio = {
  id: 3,
  name: 'Retirement',
  base_currency: 'USD',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

/** Wraps the form and reflects created records into a list, standing in for the
 *  page's prepend so the created record's canonical name is observable. */
function Harness({ onSessionExpired = vi.fn() }: { onSessionExpired?: () => void }) {
  const [items, setItems] = useState<Portfolio[]>([]);
  return (
    <>
      <CreatePortfolioForm
        onCreated={(portfolio) => setItems((prev) => [portfolio, ...prev])}
        onSessionExpired={onSessionExpired}
      />
      <ul aria-label="created">
        {items.map((portfolio) => (
          <li key={portfolio.id}>{portfolio.name}</li>
        ))}
      </ul>
    </>
  );
}

describe('CreatePortfolioForm', () => {
  it('exposes an accessible, labelled name input and a submit button', () => {
    render(<CreatePortfolioForm onCreated={vi.fn()} onSessionExpired={vi.fn()} />);

    expect(screen.getByLabelText('Portfolio name')).toHaveProperty('tagName', 'INPUT');
    expect(screen.getByRole('button', { name: 'Create portfolio' })).toBeInTheDocument();
  });

  it('creates, clears the input, and prepends the backend canonical (trimmed) name', async () => {
    server.use(http.post(PORTFOLIOS_URL, () => HttpResponse.json(RETIREMENT, { status: 201 })));
    render(<Harness />);

    const input = screen.getByLabelText('Portfolio name');
    await userEvent.type(input, '  Retirement  ');
    await userEvent.click(screen.getByRole('button', { name: 'Create portfolio' }));

    // The server's canonical trimmed name is what surfaces in the list ...
    expect(await screen.findByText('Retirement')).toBeInTheDocument();
    // ... and the input is cleared for the next entry.
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('shows the backend name error, preserves the input, and focuses the summary', async () => {
    server.use(
      http.post(PORTFOLIOS_URL, () =>
        HttpResponse.json(
          { name: ['You already have a portfolio with this name.'] },
          { status: 400 },
        ),
      ),
    );
    render(<CreatePortfolioForm onCreated={vi.fn()} onSessionExpired={vi.fn()} />);

    const input = screen.getByLabelText('Portfolio name');
    await userEvent.type(input, 'Growth');
    await userEvent.click(screen.getByRole('button', { name: 'Create portfolio' }));

    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent('You already have a portfolio with this name.');
    // Input preserved and marked invalid; focus moved to the summary.
    expect(input).toHaveValue('Growth');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(summary).toHaveFocus();
  });

  it('prevents a duplicate submit while a create is pending', async () => {
    let postCount = 0;
    server.use(
      http.post(PORTFOLIOS_URL, async () => {
        postCount += 1;
        await delay(30);
        return HttpResponse.json(RETIREMENT, { status: 201 });
      }),
    );
    render(<CreatePortfolioForm onCreated={vi.fn()} onSessionExpired={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Portfolio name'), 'Growth');
    const form = screen.getByRole('form', { name: 'Create a portfolio' });
    // Two synchronous submits: the second must be swallowed by the in-flight guard.
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(postCount).toBe(1));
    // Give any erroneous second request a chance to land, then confirm it did not.
    expect(postCount).toBe(1);
  });

  it('shows a pending status and disables the button during creation', async () => {
    server.use(
      http.post(PORTFOLIOS_URL, async () => {
        await delay(30);
        return HttpResponse.json(RETIREMENT, { status: 201 });
      }),
    );
    render(<CreatePortfolioForm onCreated={vi.fn()} onSessionExpired={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Portfolio name'), 'Growth');
    const button = screen.getByRole('button', { name: 'Create portfolio' });
    await userEvent.click(button);

    expect(screen.getByRole('status')).toHaveTextContent('Creating…');
    expect(button).toBeDisabled();

    await waitFor(() => expect(button).toBeEnabled());
  });

  it('on a 403 re-bootstraps CSRF and asks to retry without replaying the POST', async () => {
    let postCount = 0;
    let csrfCount = 0;
    const onSessionExpired = vi.fn();
    server.use(
      http.get(CSRF, () => {
        csrfCount += 1;
        return HttpResponse.json({ csrf_token: 'test-csrf-token' });
      }),
      http.post(PORTFOLIOS_URL, () => {
        postCount += 1;
        return HttpResponse.json({ detail: 'CSRF verification failed.' }, { status: 403 });
      }),
    );
    render(<Harness onSessionExpired={onSessionExpired} />);

    await userEvent.type(screen.getByLabelText('Portfolio name'), 'Growth');
    await userEvent.click(screen.getByRole('button', { name: 'Create portfolio' }));

    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent('Your session could not be verified. Please try again.');
    // The POST fired exactly once (never auto-replayed) ...
    expect(postCount).toBe(1);
    // ... a fresh CSRF token was bootstrapped after the failure (prime + re-prime) ...
    await waitFor(() => expect(csrfCount).toBe(2));
    // ... and the user stays authenticated (no session-expiry transition).
    expect(onSessionExpired).not.toHaveBeenCalled();
  });
});
