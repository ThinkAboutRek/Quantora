import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AUTH_BASE_URL } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import { AuthProvider } from '../AuthProvider';
import { PublicOnlyRoute } from './PublicOnlyRoute';

const ME = `${AUTH_BASE_URL}/me/`;

interface Entry {
  readonly pathname: string;
  readonly state?: unknown;
}

function renderPublicOnly(entry: Entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<h1>Login form</h1>} />
          </Route>
          <Route path="/app" element={<h1>App home</h1>} />
          <Route path="/app/portfolio" element={<h1>Portfolio</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('PublicOnlyRoute', () => {
  it('renders the nested form when anonymous', async () => {
    server.use(http.get(ME, () => new HttpResponse(null, { status: 401 })));
    renderPublicOnly({ pathname: '/login' });
    expect(await screen.findByRole('heading', { name: 'Login form' })).toBeInTheDocument();
  });

  it('redirects an authenticated user to a valid internal return path', async () => {
    renderPublicOnly({ pathname: '/login', state: { from: '/app/portfolio' } });
    expect(await screen.findByRole('heading', { name: 'Portfolio' })).toBeInTheDocument();
  });

  it('falls back to /app when authenticated with no return path', async () => {
    renderPublicOnly({ pathname: '/login' });
    expect(await screen.findByRole('heading', { name: 'App home' })).toBeInTheDocument();
  });

  it('rejects an external return path and falls back to /app', async () => {
    renderPublicOnly({ pathname: '/login', state: { from: 'https://evil.example.com' } });
    expect(await screen.findByRole('heading', { name: 'App home' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Portfolio' })).not.toBeInTheDocument();
  });
});
