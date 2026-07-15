import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs with `globals: false`, so React Testing Library cannot detect the
// test runner and auto-register its cleanup. Register it explicitly here;
// without it the jsdom DOM leaks between tests (e.g. "Found multiple elements
// with the role ...").
afterEach(() => {
  cleanup();
});
