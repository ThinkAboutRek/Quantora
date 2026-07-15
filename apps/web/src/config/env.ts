// Application configuration derived from Vite environment variables.
//
// This module runs its validation at import time so that a misconfigured build
// fails fast at startup rather than silently pointing the app at the wrong
// origin. It makes NO network calls; it only reads and validates values.

export interface AppConfig {
  /** Base URL the app uses for API requests. */
  readonly apiBaseUrl: string;
}

/** Default used when `VITE_API_BASE_URL` is absent or empty. */
export const DEFAULT_API_BASE_URL = '/api/v1';

/**
 * Validate and normalise a candidate API base URL.
 *
 * Accepted forms:
 *   - absent or empty          -> falls back to {@link DEFAULT_API_BASE_URL}
 *   - a root-relative path      -> a single leading "/" (e.g. "/api/v1")
 *   - an absolute http(s) URL   -> e.g. "https://api.example.com/v1"
 *
 * Anything else (a protocol-relative "//host", a bare "host/path", or a
 * non-http(s) scheme) is malformed and throws. Exported separately from the
 * frozen config object so it can be unit-tested as a pure function.
 */
export function readApiBaseUrl(rawValue: string | undefined): string {
  const value = rawValue?.trim();
  if (value === undefined || value === '') {
    return DEFAULT_API_BASE_URL;
  }

  if (value.startsWith('/')) {
    // Reject protocol-relative URLs ("//host/path"): they are not root-relative
    // paths and silently change the origin.
    if (value.startsWith('//')) {
      throw new Error(
        `Invalid VITE_API_BASE_URL: "${value}" looks like a protocol-relative URL. ` +
          `Use a root-relative path (e.g. "/api/v1") or a full http(s) URL.`,
      );
    }
    return value;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `Invalid VITE_API_BASE_URL: "${value}" is not a root-relative path or a valid ` +
        `http(s) URL.`,
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Invalid VITE_API_BASE_URL: "${value}" must use the http or https protocol ` +
        `(got "${parsed.protocol}").`,
    );
  }

  return value;
}

function readConfig(): AppConfig {
  return Object.freeze({
    apiBaseUrl: readApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  });
}

/** Frozen, validated application configuration. */
export const config: AppConfig = readConfig();
