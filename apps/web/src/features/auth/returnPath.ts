// Validator for a post-login "return to" path.
//
// The value comes from router state (set when a guard bounces an anonymous user
// to /login) or, potentially, from other in-app navigation. It is treated as
// untrusted: only a genuine internal path — a root-relative pathname with an
// optional search and hash — is accepted. Anything that could redirect the user
// off-origin (an absolute URL, a scheme, a protocol-relative or backslash form)
// falls back to the app home. This is feature-scoped on purpose; it is not a
// general-purpose URL utility.

/** Where an invalid or absent return path lands. */
export const DEFAULT_RETURN_PATH = '/app';

export function safeReturnPath(candidate: unknown): string {
  if (typeof candidate !== 'string' || candidate === '') {
    return DEFAULT_RETURN_PATH;
  }

  const value = candidate;

  // Must be root-relative: exactly one leading slash.
  if (!value.startsWith('/') || value.startsWith('//')) {
    return DEFAULT_RETURN_PATH;
  }

  // Browsers treat backslashes as slashes, so "/\evil.com" behaves like a
  // protocol-relative URL. Reject any backslash outright.
  if (value.includes('\\')) {
    return DEFAULT_RETURN_PATH;
  }

  // Reject any whitespace (spaces, tabs, newlines): a real path is encoded.
  if (/\s/.test(value)) {
    return DEFAULT_RETURN_PATH;
  }

  // Defence in depth: resolve against a throwaway origin and confirm the value
  // did not escape it (which would reveal a host or scheme injection). The URL
  // parser also normalises backslashes, so an origin change here catches forms
  // the string checks above might miss.
  try {
    const resolved = new URL(value, 'http://internal.invalid');
    if (resolved.origin !== 'http://internal.invalid') {
      return DEFAULT_RETURN_PATH;
    }
  } catch {
    return DEFAULT_RETURN_PATH;
  }

  return value;
}
