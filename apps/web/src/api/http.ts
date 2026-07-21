// Minimal fetch wrapper for the Quantora JSON API.
//
// It does three jobs: build an absolute URL from the configured API base,
// attach the credentials and CSRF header the session-auth backend expects, and
// translate every response — success, DRF error, throttle, network failure, or
// abort — into either parsed data or a typed thrown error. There is no
// interceptor stack, retry policy, response cache, or request queue here by
// design; callers get one function, `request`, and a small set of error types.

import { config } from '../config/env';
import { getCsrfToken } from './csrfToken';

/** DRF field-error shape: a map of field name to one or more messages. */
export type FieldErrors = Record<string, string[]>;

/** Base type for every error `request` throws. `status` is 0 for transport-
 *  level failures (network, abort) that never produced an HTTP response. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** A 400 response. Carries DRF field errors and/or a generic `detail` string. */
export class ValidationError extends ApiError {
  readonly fieldErrors: FieldErrors;
  readonly detail?: string;

  constructor(fieldErrors: FieldErrors, detail?: string) {
    super(400, 'The request was invalid.');
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
    this.detail = detail;
  }
}

/** A 401 response: no valid session. */
export class AuthError extends ApiError {
  constructor() {
    super(401, 'Authentication is required.');
    this.name = 'AuthError';
  }
}

/** A 403 response. On this API the only source is a failed CSRF check. */
export class CsrfError extends ApiError {
  constructor() {
    super(403, 'CSRF verification failed.');
    this.name = 'CsrfError';
  }
}

/** A 429 response. `retryAfterSeconds` is populated only from a valid integer
 *  `Retry-After` header; the throttle scope and rate are never surfaced. */
export class ThrottledError extends ApiError {
  readonly retryAfterSeconds: number | null;

  constructor(retryAfterSeconds: number | null) {
    super(429, 'Too many requests.');
    this.name = 'ThrottledError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The request never reached a response (DNS/TLS/connection failure, etc.). */
export class NetworkError extends ApiError {
  constructor() {
    super(0, 'The network request failed.');
    this.name = 'NetworkError';
  }
}

/** The request was aborted via its `AbortSignal`. Callers treat this as a
 *  non-error cancellation, not a user-facing failure. */
export class RequestAbortedError extends ApiError {
  constructor() {
    super(0, 'The request was aborted.');
    this.name = 'RequestAbortedError';
  }
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Resolve `path` against `base` into an absolute URL string.
 *
 * `base` may be root-relative (`/api/v1`) or absolute
 * (`https://api.example.com/api/v1`). It is normalised to exactly one trailing
 * slash; a root-relative base is anchored to `window.location.origin`. Leading
 * slashes are stripped from `path` so it is always treated as relative, which
 * preserves Django's trailing slash on the final segment.
 */
export function resolveApiUrl(base: string, path: string): string {
  const absoluteBase = base.startsWith('/')
    ? new URL(base, window.location.origin).toString()
    : base;
  const normalisedBase = absoluteBase.replace(/\/+$/, '') + '/';
  const relativePath = path.replace(/^\/+/, '');
  return new URL(relativePath, normalisedBase).toString();
}

/** Build an absolute API URL for `path` using the configured API base. */
export function buildApiUrl(path: string): string {
  return resolveApiUrl(config.apiBaseUrl, path);
}

export interface RequestOptions {
  readonly method?: string;
  /** JSON-serialisable request body; presence sets the JSON Content-Type. */
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

/**
 * Perform an API request and return parsed JSON (or `undefined` for an empty
 * 204/205), throwing a typed {@link ApiError} subclass on any failure.
 */
export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers();
  const init: RequestInit = { method, credentials: 'include', headers };

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(options.body);
  }

  if (UNSAFE_METHODS.has(method)) {
    const token = getCsrfToken();
    if (token !== null) {
      headers.set('X-CSRFToken', token);
    }
  }

  if (options.signal !== undefined) {
    init.signal = options.signal;
  }

  let response: Response;
  try {
    response = await fetch(buildApiUrl(path), init);
  } catch (error) {
    if (isAbortError(error)) {
      throw new RequestAbortedError();
    }
    throw new NetworkError();
  }

  return handleResponse<T>(response);
}

async function handleResponse<T>(response: Response): Promise<T> {
  const { status } = response;

  if (status === 204 || status === 205) {
    return undefined as T;
  }

  if (status >= 200 && status < 300) {
    const data = await readJsonBody(response);
    if (data === null) {
      throw new ApiError(status, 'The response body was empty or not valid JSON.');
    }
    return data as T;
  }

  // Error statuses. The parsed body is used only to extract known, safe string
  // fields; a non-JSON body (e.g. an HTML error page) parses to `null` and is
  // discarded, so raw markup is never retained or surfaced.
  const body = await readJsonBody(response);

  switch (status) {
    case 400:
      throw new ValidationError(extractFieldErrors(body), extractDetail(body));
    case 401:
      throw new AuthError();
    case 403:
      throw new CsrfError();
    case 429:
      throw new ThrottledError(readRetryAfterSeconds(response));
    default:
      throw new ApiError(status, `The request failed with status ${status}.`);
  }
}

/** Read and JSON-parse a response body, returning `null` if it is empty or not
 *  valid JSON. The raw text is never returned, so HTML is never retained. */
async function readJsonBody(response: Response): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return null;
  }
  if (text === '') {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractDetail(body: unknown): string | undefined {
  if (isRecord(body) && typeof body.detail === 'string') {
    return body.detail;
  }
  return undefined;
}

function extractFieldErrors(body: unknown): FieldErrors {
  const result: FieldErrors = {};
  if (!isRecord(body)) {
    return result;
  }
  for (const [key, value] of Object.entries(body)) {
    if (key === 'detail') {
      continue;
    }
    if (Array.isArray(value)) {
      const messages = value.filter((message): message is string => typeof message === 'string');
      if (messages.length > 0) {
        result[key] = messages;
      }
    } else if (typeof value === 'string') {
      result[key] = [value];
    }
  }
  return result;
}

function readRetryAfterSeconds(response: Response): number | null {
  const raw = response.headers.get('Retry-After');
  if (raw === null) {
    return null;
  }
  const seconds = Number(raw);
  // Only the delta-seconds form is honoured; the HTTP-date form is ignored so
  // no locale/clock parsing leaks in. Never expose the scope or rate.
  if (Number.isInteger(seconds) && seconds >= 0) {
    return seconds;
  }
  return null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
