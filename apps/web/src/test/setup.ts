import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { clearCsrfToken } from '../api/csrfToken';
import { server } from '../mocks/server';

// Vitest runs with `globals: false`, so the lifecycle hooks are imported
// explicitly and React Testing Library's cleanup is registered by hand (without
// it the jsdom DOM leaks between tests, e.g. "Found multiple elements with the
// role ...").

// Start the MSW server once. `onUnhandledRequest: 'error'` makes any request
// that no handler matches fail the test loudly, catching a mismatched URL.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  // Drop any per-test handler overrides and reset the in-memory CSRF token so
  // no auth state leaks from one test into the next.
  server.resetHandlers();
  clearCsrfToken();
});

afterAll(() => {
  server.close();
});
