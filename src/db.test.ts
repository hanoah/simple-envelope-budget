import { describe, expect, it, beforeEach } from 'vitest';
import {
  addExpense,
  addWishlistItem,
  exportBackup,
  getAllWishlist,
  getExpense,
  getExpensesForMonth,
  getSettings,
  importBackup,
  parseBackupJson,
  resetDbForTests,
  saveSettings,
} from './db.ts';
import { BACKUP_VERSION } from './types.ts';
import type { WishlistItem } from './types.ts';

beforeEach(async () => {
  await resetDbForTests();
});

describe('settings + expenses', () => {
  it('saves and reads settings', async () => {
    await saveSettings(50_000);
    const s = await getSettings();
    expect(s?.monthlyBudget).toBe(50_000);
  });

  it('adds expense and queries by month', async () => {
    await saveSettings(100_00);
    await addExpense({
      id: 'e1',
      date: '2026-03-10',
      amount: 12_50,
      description: 'coffee',
      createdAt: 1,
    });
    const list = await getExpensesForMonth('2026-03');
    expect(list).toHaveLength(1);
    expect(list[0]?.amount).toBe(12_50);
  });

  it('getExpense returns row', async () => {
    await addExpense({
      id: 'x',
      date: '2026-03-01',
      amount: 1,
      description: '',
      createdAt: 2,
    });
    const e = await getExpense('x');
    expect(e?.id).toBe('x');
  });
});

describe('parseBackupJson', () => {
  it('accepts valid payload', () => {
    const text = JSON.stringify({
      version: BACKUP_VERSION,
      exportedAt: 1,
      settings: { monthlyBudget: 100 },
      expenses: [],
      wishlist: [],
    });
    const p = parseBackupJson(text);
    expect(p.settings.monthlyBudget).toBe(100);
  });

  it('rejects bad version', () => {
    expect(() =>
      parseBackupJson(
        JSON.stringify({
          version: 99,
          exportedAt: 1,
          settings: { monthlyBudget: 1 },
          expenses: [],
          wishlist: [],
        }),
      ),
    ).toThrow();
  });
});

describe('importBackup atomic replace', () => {
  it('replaces all stores', async () => {
    await saveSettings(100_00);
    await addExpense({
      id: 'a',
      date: '2026-03-01',
      amount: 5,
      description: 'x',
      createdAt: 1,
    });
    const payload = {
      version: BACKUP_VERSION as typeof BACKUP_VERSION,
      exportedAt: Date.now(),
      settings: { monthlyBudget: 200_00 },
      expenses: [
        {
          id: 'b',
          date: '2026-04-01',
          amount: 10,
          description: 'y',
          createdAt: 2,
        },
      ],
      wishlist: [],
    };
    await importBackup(payload);
    const s = await getSettings();
    expect(s?.monthlyBudget).toBe(200_00);
    const ex = await getExpensesForMonth('2026-03');
    expect(ex).toHaveLength(0);
    const april = await getExpensesForMonth('2026-04');
    expect(april).toHaveLength(1);
  });
});

describe('wishlist url field', () => {
  const makeItem = (overrides?: Partial<WishlistItem>): WishlistItem => ({
    id: 'w1',
    title: 'Headphones',
    createdAt: 1,
    reminderDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
    notified: false,
    purchased: false,
    ...overrides,
  });

  it('stores and retrieves url on wishlist item', async () => {
    await addWishlistItem(makeItem({ url: 'https://example.com/product' }));
    const items = await getAllWishlist();
    expect(items).toHaveLength(1);
    expect(items[0]?.url).toBe('https://example.com/product');
  });

  it('stores item without url (optional)', async () => {
    await addWishlistItem(makeItem());
    const items = await getAllWishlist();
    expect(items).toHaveLength(1);
    expect(items[0]?.url).toBeUndefined();
  });

  it('includes url in export', async () => {
    await addWishlistItem(makeItem({ url: 'https://store.example.com/item?id=42' }));
    const backup = await exportBackup();
    expect(backup.wishlist).toHaveLength(1);
    expect(backup.wishlist[0]?.url).toBe('https://store.example.com/item?id=42');
  });

  it('exports undefined url as undefined', async () => {
    await addWishlistItem(makeItem());
    const backup = await exportBackup();
    expect(backup.wishlist[0]?.url).toBeUndefined();
  });

  it('imports url from backup', async () => {
    const payload = {
      version: BACKUP_VERSION as typeof BACKUP_VERSION,
      exportedAt: Date.now(),
      settings: { monthlyBudget: 100_00 },
      expenses: [],
      wishlist: [
        {
          id: 'w2',
          title: 'Book',
          url: 'https://bookstore.com/book/123',
          createdAt: 1,
          reminderDate: Date.now(),
          notified: false,
          purchased: false,
        },
      ],
    };
    await importBackup(payload);
    const items = await getAllWishlist();
    expect(items).toHaveLength(1);
    expect(items[0]?.url).toBe('https://bookstore.com/book/123');
  });

  it('imports item without url from backup', async () => {
    const payload = {
      version: BACKUP_VERSION as typeof BACKUP_VERSION,
      exportedAt: Date.now(),
      settings: { monthlyBudget: 100_00 },
      expenses: [],
      wishlist: [
        {
          id: 'w3',
          title: 'Lamp',
          createdAt: 1,
          reminderDate: Date.now(),
          notified: false,
          purchased: false,
        },
      ],
    };
    await importBackup(payload);
    const items = await getAllWishlist();
    expect(items[0]?.url).toBeUndefined();
  });
});

describe('parseBackupJson url validation', () => {
  it('accepts wishlist entry with valid url string', () => {
    const text = JSON.stringify({
      version: BACKUP_VERSION,
      exportedAt: 1,
      settings: { monthlyBudget: 100 },
      expenses: [],
      wishlist: [
        {
          id: 'w1',
          title: 'Thing',
          url: 'https://example.com',
          createdAt: 1,
          reminderDate: 1,
          notified: false,
          purchased: false,
        },
      ],
    });
    const p = parseBackupJson(text);
    expect(p.wishlist).toHaveLength(1);
  });

  it('rejects wishlist entry with non-string url', () => {
    const text = JSON.stringify({
      version: BACKUP_VERSION,
      exportedAt: 1,
      settings: { monthlyBudget: 100 },
      expenses: [],
      wishlist: [
        {
          id: 'w1',
          title: 'Thing',
          url: 123,
          createdAt: 1,
          reminderDate: 1,
          notified: false,
          purchased: false,
        },
      ],
    });
    expect(() => parseBackupJson(text)).toThrow('Invalid wishlist entry');
  });

  it('accepts wishlist entry without url field', () => {
    const text = JSON.stringify({
      version: BACKUP_VERSION,
      exportedAt: 1,
      settings: { monthlyBudget: 100 },
      expenses: [],
      wishlist: [
        {
          id: 'w1',
          title: 'Thing',
          createdAt: 1,
          reminderDate: 1,
          notified: false,
          purchased: false,
        },
      ],
    });
    const p = parseBackupJson(text);
    expect(p.wishlist).toHaveLength(1);
  });
});
