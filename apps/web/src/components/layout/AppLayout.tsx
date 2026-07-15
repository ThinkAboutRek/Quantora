import { Outlet } from 'react-router';

/**
 * Shared application shell: a semantic header and footer wrapping the routed
 * page content. It deliberately carries no navigation links yet — there are no
 * secondary routes to link to in this phase.
 */
export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-header__brand">Quantora</span>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <p className="app-footer__note">
          Quantora — educational portfolio analytics. Not investment advice.
        </p>
      </footer>
    </div>
  );
}
