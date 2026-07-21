import { describe, expect, it } from 'vitest';
import { DEFAULT_RETURN_PATH, safeReturnPath } from './returnPath';

describe('safeReturnPath', () => {
  it('accepts a plain internal path', () => {
    expect(safeReturnPath('/app')).toBe('/app');
    expect(safeReturnPath('/app/portfolio')).toBe('/app/portfolio');
  });

  it('accepts an internal path with a search and hash', () => {
    expect(safeReturnPath('/app?tab=holdings#top')).toBe('/app?tab=holdings#top');
  });

  it('falls back for a non-string or empty input', () => {
    expect(safeReturnPath(undefined)).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath(null)).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath(42)).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath('')).toBe(DEFAULT_RETURN_PATH);
  });

  it('rejects a path that is not root-relative', () => {
    expect(safeReturnPath('app')).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath('app/portfolio')).toBe(DEFAULT_RETURN_PATH);
  });

  it('rejects a protocol-relative URL', () => {
    expect(safeReturnPath('//evil.example.com')).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath('//evil.example.com/app')).toBe(DEFAULT_RETURN_PATH);
  });

  it('rejects an absolute URL', () => {
    expect(safeReturnPath('https://evil.example.com/app')).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath('http://evil.example.com')).toBe(DEFAULT_RETURN_PATH);
  });

  it('rejects a non-http scheme', () => {
    expect(safeReturnPath('javascript:alert(1)')).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath('mailto:someone@example.com')).toBe(DEFAULT_RETURN_PATH);
  });

  it('rejects backslash-based bypass attempts', () => {
    expect(safeReturnPath('/\\evil.example.com')).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath('\\\\evil.example.com')).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath('/app\\..\\..')).toBe(DEFAULT_RETURN_PATH);
  });

  it('rejects a path containing whitespace', () => {
    expect(safeReturnPath('/app /portfolio')).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath('/app\nmalicious')).toBe(DEFAULT_RETURN_PATH);
  });
});
