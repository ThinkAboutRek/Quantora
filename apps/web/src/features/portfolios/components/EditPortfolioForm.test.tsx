import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { getCsrfToken } from '../../../api/csrfToken';
import { AUTH_BASE_URL, DEFAULT_PORTFOLIO, portfolioDetailUrl } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import type { Portfolio } from '../types';
import { EditPortfolioForm } from './EditPortfolioForm';

const PATCH_URL = portfolioDetailUrl(DEFAULT_PORTFOLIO.id);
const CSRF_URL = `${AUTH_BASE_URL}/csrf/`;

function renderForm(
  overrides: Partial<{
    onRenamed: (portfolio: Portfolio) => void;
    onSessionExpired: () => void;
    onNotFound: () => void;
  }> = {},
) {
  const handlers = {
    onRenamed: vi.fn(),
    onSessionExpired: vi.fn(),
    onNotFound: vi.fn(),
    ...overrides,
  };
  render(<EditPortfolioForm portfolio={DEFAULT_PORTFOLIO} {...handlers} />);
  return handlers;
}

describe('EditPortfolioForm', () => {
  it('prefills the current name', () => {
    renderForm();

    expect(screen.getByLabelText('Portfolio name')).toHaveValue('Growth');
  });

  it('hands the authoritative renamed record upward on success', async () => {
    const onRenamed = vi.fn();
    server.use(
      http.patch(PATCH_URL, () => HttpResponse.json({ ...DEFAULT_PORTFOLIO, name: 'Renamed' })),
    );
    renderForm({ onRenamed });

    const input = screen.getByLabelText('Portfolio name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Rename portfolio' }));

    await waitFor(() =>
      expect(onRenamed).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed' })),
    );
  });

  it('shows a field 400 on the field and in the summary, preserving the input', async () => {
    server.use(
      http.patch(PATCH_URL, () =>
        HttpResponse.json(
          { name: ['You already have a portfolio with this name.'] },
          { status: 400 },
        ),
      ),
    );
    renderForm();

    const input = screen.getByLabelText('Portfolio name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Income');
    await userEvent.click(screen.getByRole('button', { name: 'Rename portfolio' }));

    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent('You already have a portfolio with this name.');
    // Focus lands on the summary, the field is marked invalid, and the entered
    // name is preserved for editing.
    expect(summary).toHaveFocus();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveValue('Income');
  });

  it('shows a lifecycle 400 as a summary-only message, not a field error', async () => {
    server.use(
      http.patch(PATCH_URL, () =>
        HttpResponse.json(
          { detail: 'Unarchive the portfolio before renaming it.' },
          {
            status: 400,
          },
        ),
      ),
    );
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Rename portfolio' }));

    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent('Unarchive the portfolio before renaming it.');
    expect(screen.getByLabelText('Portfolio name')).not.toHaveAttribute('aria-invalid');
  });

  it('re-bootstraps the CSRF token on a 403 and never replays the PATCH', async () => {
    let csrfCalls = 0;
    let patchCalls = 0;
    server.use(
      http.get(CSRF_URL, () => {
        csrfCalls += 1;
        return HttpResponse.json({ csrf_token: 'fresh-token' });
      }),
      http.patch(PATCH_URL, () => {
        patchCalls += 1;
        return HttpResponse.json({ detail: 'CSRF verification failed.' }, { status: 403 });
      }),
    );
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Rename portfolio' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be verified/i);
    await waitFor(() => expect(csrfCalls).toBe(2));
    expect(patchCalls).toBe(1);
    expect(getCsrfToken()).toBe('fresh-token');
  });

  it('invokes the session-expiry handler on a 401', async () => {
    const onSessionExpired = vi.fn();
    server.use(http.patch(PATCH_URL, () => new HttpResponse(null, { status: 401 })));
    renderForm({ onSessionExpired });

    await userEvent.click(screen.getByRole('button', { name: 'Rename portfolio' }));

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
  });

  it('invokes the not-found handler on the concealed 404', async () => {
    const onNotFound = vi.fn();
    server.use(http.patch(PATCH_URL, () => new HttpResponse(null, { status: 404 })));
    renderForm({ onNotFound });

    await userEvent.click(screen.getByRole('button', { name: 'Rename portfolio' }));

    await waitFor(() => expect(onNotFound).toHaveBeenCalledTimes(1));
  });

  it('disables the controls while pending and blocks a duplicate submit', async () => {
    let patchCalls = 0;
    server.use(
      http.patch(PATCH_URL, async () => {
        patchCalls += 1;
        await delay(40);
        return HttpResponse.json(DEFAULT_PORTFOLIO);
      }),
    );
    const onRenamed = vi.fn();
    renderForm({ onRenamed });

    await userEvent.click(screen.getByRole('button', { name: 'Rename portfolio' }));
    expect(screen.getByRole('button', { name: 'Rename portfolio' })).toBeDisabled();
    expect(screen.getByLabelText('Portfolio name')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Rename portfolio' }));

    await waitFor(() => expect(onRenamed).toHaveBeenCalledTimes(1));
    expect(patchCalls).toBe(1);
  });
});
