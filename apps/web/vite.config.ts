import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// `API_PROXY_TARGET` is read only here, in Node during dev-server startup — it
// is NOT a `VITE_`-prefixed variable, so it never reaches the browser bundle.
// Locally it defaults to the host-native API; in Docker the Compose override
// sets it to the `django-api` service.
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000';

// Vite + Vitest configuration. `envDir` is intentionally left at its default
// (the Vite project root, apps/web), which is where `.env` / `.env.example`
// live and where `VITE_*` variables are read from.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: apiProxyTarget, changeOrigin: true },
    },
  },
  test: {
    globals: false,
    environment: 'jsdom',
    // Pin the jsdom document origin so `window.location.origin` is a stable,
    // absolute base. The API URL builder resolves root-relative bases against
    // this origin, and the MSW handlers register absolute URLs that must match
    // it exactly (unhandled requests are treated as errors).
    environmentOptions: {
      jsdom: { url: 'http://localhost:5173/' },
    },
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
