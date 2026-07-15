/// <reference types="vite/client" />

// Declaration-merge the environment variables this app reads onto the
// `ImportMetaEnv` interface that vite/client wires to `import.meta.env`.
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}
