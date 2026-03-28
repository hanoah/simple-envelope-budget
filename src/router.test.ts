import { describe, expect, it, afterEach } from 'vitest';
import { parseHash } from './router.ts';

describe('parseHash', () => {
  const original = window.location.href;

  afterEach(() => {
    window.history.pushState({}, '', original);
  });

  it('defaults to home', () => {
    window.location.hash = '';
    expect(parseHash().name).toBe('home');
  });

  it('parses log with id', () => {
    window.location.hash = '#/log?id=abc-1';
    const r = parseHash();
    expect(r.name).toBe('log');
    expect(r.expenseId).toBe('abc-1');
  });

  it('parses wishlist', () => {
    window.location.hash = '#/wishlist';
    expect(parseHash().name).toBe('wishlist');
  });

  it('parses settings', () => {
    window.location.hash = '#/settings';
    expect(parseHash().name).toBe('settings');
  });

  it('parses log with desc param', () => {
    window.location.hash = '#/log?desc=Groceries';
    const r = parseHash();
    expect(r.name).toBe('log');
    expect(r.prefillDesc).toBe('Groceries');
    expect(r.expenseId).toBeUndefined();
  });

  it('returns undefined prefillDesc when no desc param', () => {
    window.location.hash = '#/log';
    const r = parseHash();
    expect(r.name).toBe('log');
    expect(r.prefillDesc).toBeUndefined();
  });
});
