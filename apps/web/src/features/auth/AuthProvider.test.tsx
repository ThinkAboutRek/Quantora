import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { StrictMode, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AUTH_BASE_URL, DEFAULT_USER } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';

const ME = `${AUTH_BASE_URL}/me/`;
const CSRF = `${AUTH_BASE_URL}/csrf/`;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Surfaces the auth context as text and exposes the actions as buttons. */
function Harness() {
  const { user, status, retrySessionRestore } = useAuth();
  return (
    <div>
      <p>status: {status}</p>
      <p>user: {user ? user.email : 'none'}</p>
      <button type="button" onClick={retrySessionRestore}>
        retry
      </button>
    </div>
  );
}

function renderWithProvider(ui: ReactNode = <Harness />) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe('AuthProvider startup probe', () => {
  it('restores an authenticated session from a 200 me response', async () => {
    renderWithProvider();
    expect(await screen.findByText('status: authenticated')).toBeInTheDocument();
    expect(screen.getByText(`user: ${DEFAULT_USER.email}`)).toBeInTheDocument();
  });

  it('reports anonymous when me returns 401', async () => {
    server.use(http.get(ME, () => new HttpResponse(null, { status: 401 })));
    renderWithProvider();
    expect(await screen.findByText('status: anonymous')).toBeInTheDocument();
    expect(screen.getByText('user: none')).toBeInTheDocument();
  });

  it('reports error on a network failure', async () => {
    server.use(http.get(ME, () => HttpResponse.error()));
    renderWithProvider();
    expect(await screen.findByText('status: error')).toBeInTheDocument();
  });

  it('reports error on a 5xx response', async () => {
    server.use(http.get(ME, () => new HttpResponse(null, { status: 500 })));
    renderWithProvider();
    expect(await screen.findByText('status: error')).toBeInTheDocument();
  });

  it('keeps an authenticated session when only the csrf probe fails', async () => {
    server.use(http.get(CSRF, () => new HttpResponse(null, { status: 500 })));
    renderWithProvider();
    expect(await screen.findByText('status: authenticated')).toBeInTheDocument();
    expect(screen.getByText(`user: ${DEFAULT_USER.email}`)).toBeInTheDocument();
  });

  it('recovers via retrySessionRestore after an error', async () => {
    server.use(http.get(ME, () => new HttpResponse(null, { status: 500 })));
    renderWithProvider();
    expect(await screen.findByText('status: error')).toBeInTheDocument();

    server.use(http.get(ME, () => HttpResponse.json(DEFAULT_USER)));
    await userEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(await screen.findByText('status: authenticated')).toBeInTheDocument();
  });

  it('restores safely under StrictMode double-invocation', async () => {
    render(
      <StrictMode>
        <AuthProvider>
          <Harness />
        </AuthProvider>
      </StrictMode>,
    );
    expect(await screen.findByText('status: authenticated')).toBeInTheDocument();
    expect(screen.getByText(`user: ${DEFAULT_USER.email}`)).toBeInTheDocument();
  });

  it('does not update state or surface an error after an aborted (unmounted) probe', async () => {
    server.use(
      http.get(ME, async () => {
        await delay(50);
        return HttpResponse.json(DEFAULT_USER);
      }),
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { unmount } = renderWithProvider();
    // The probe is still in flight (delayed response); unmounting aborts it.
    expect(screen.getByText('status: loading')).toBeInTheDocument();
    unmount();

    // Let the delayed response resolve after the abort; nothing should throw and
    // React should log no unmounted-update / uncaught error.
    await sleep(90);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('useAuth', () => {
  it('throws when used outside an AuthProvider', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Orphan() {
      useAuth();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/must be used within an AuthProvider/);
    errorSpy.mockRestore();
  });
});
