import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// ESLint 9 flat config. General JS/TS rules only — no React or Vite plugins,
// and the non-type-checked presets (type-aware linting is added in Phase 4
// alongside real source and a project service).
export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'build', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
