import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// ESLint 9 flat config. The base is the non-type-checked @eslint/js +
// typescript-eslint presets; type-aware linting is intentionally not enabled.
// React support is added via the React Hooks rules and the Vite React Refresh
// rule. The `.flat` react-hooks entry is required under flat config (the legacy
// `recommended-latest` entry is eslintrc-shaped and throws here).
export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'build', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],
  reactRefresh.configs.vite,
);
