import { describe, expect, it } from 'vitest';
import { DEFAULT_API_BASE_URL, readApiBaseUrl } from './env';

describe('readApiBaseUrl', () => {
  it('falls back to the default when the value is absent', () => {
    expect(readApiBaseUrl(undefined)).toBe(DEFAULT_API_BASE_URL);
  });

  it('falls back to the default when the value is empty or whitespace-only', () => {
    expect(readApiBaseUrl('')).toBe(DEFAULT_API_BASE_URL);
    expect(readApiBaseUrl('   ')).toBe(DEFAULT_API_BASE_URL);
  });

  it('accepts a root-relative path', () => {
    expect(readApiBaseUrl('/api/v1')).toBe('/api/v1');
    expect(readApiBaseUrl('/custom/base')).toBe('/custom/base');
  });

  it('accepts an absolute https URL', () => {
    expect(readApiBaseUrl('https://api.example.com/v1')).toBe('https://api.example.com/v1');
  });

  it('accepts an absolute http URL', () => {
    expect(readApiBaseUrl('http://localhost:8000/api')).toBe('http://localhost:8000/api');
  });

  it('throws on a protocol-relative URL', () => {
    expect(() => readApiBaseUrl('//evil.example.com')).toThrow(/protocol-relative/);
  });

  it('throws on a bare host with no scheme', () => {
    expect(() => readApiBaseUrl('api.example.com/v1')).toThrow(/VITE_API_BASE_URL/);
  });

  it('throws on a non-http(s) scheme', () => {
    expect(() => readApiBaseUrl('ftp://files.example.com')).toThrow(/http or https/);
  });
});
