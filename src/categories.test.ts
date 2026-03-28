import { describe, expect, it } from 'vitest';
import { categoryIconFor, QUICK_CATEGORIES } from './categories.ts';

describe('QUICK_CATEGORIES', () => {
  it('contains Groceries and Gas', () => {
    const labels = QUICK_CATEGORIES.map((c) => c.label);
    expect(labels).toContain('Groceries');
    expect(labels).toContain('Gas');
  });

  it('each entry has a non-empty icon string', () => {
    for (const cat of QUICK_CATEGORIES) {
      expect(cat.icon.length).toBeGreaterThan(0);
      expect(cat.icon).toContain('<svg');
    }
  });
});

describe('categoryIconFor', () => {
  it('returns icon for exact category match', () => {
    const icon = categoryIconFor('Groceries');
    expect(icon).not.toBeNull();
    expect(icon).toContain('<svg');
  });

  it('matches case-insensitively', () => {
    expect(categoryIconFor('groceries')).not.toBeNull();
    expect(categoryIconFor('GROCERIES')).not.toBeNull();
    expect(categoryIconFor('gas')).not.toBeNull();
    expect(categoryIconFor('GAS')).not.toBeNull();
  });

  it('matches as substring', () => {
    expect(categoryIconFor('Groceries + household')).not.toBeNull();
    expect(categoryIconFor('Got gas today')).not.toBeNull();
  });

  it('returns null for non-matching description', () => {
    expect(categoryIconFor('Coffee')).toBeNull();
    expect(categoryIconFor('Rent payment')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(categoryIconFor('')).toBeNull();
  });
});
