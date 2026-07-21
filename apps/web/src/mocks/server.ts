import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Node-side MSW server used by the Vitest suite. This is test-only: there is
// deliberately no browser service worker and no public/mockServiceWorker.js.
export const server = setupServer(...handlers);
