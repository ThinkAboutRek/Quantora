import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Vite + Vitest configuration. `envDir` is intentionally left at its default
// (the Vite project root, apps/web), which is where `.env` / `.env.example`
// live and where `VITE_*` variables are read from.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
