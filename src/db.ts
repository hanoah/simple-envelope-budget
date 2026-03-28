/**
 * IndexedDB layer + BroadcastChannel sync.
 *
 *   [views] --write--> [db.ts] --postMessage--> [BroadcastChannel]
 *        ^                                        |
 *        +------------ re-render ------------------+
 *
 * importAll: single readwrite transaction clears + puts (atomic).
 */
import { openDB, type IDBPDatabase } from 'idb';
import {
  BACKUP_VERSION,
  type BackupPayload,
  type Expense,
  type SettingsRow,
  type WishlistItem,
  type WishlistItemWire,
} from './types.ts';

export const DB_NAME = 'budget-envelope';
export const DB_VERSION = 2;
export const BROADCAST_CHANNEL_NAME = 'budget-data';

const STORE_SETTINGS = 'settings';
const STORE_EXPENSES = 'expenses';
const STORE_WISHLIST = 'wishlist';

export interface BudgetDBSchema {
  [STORE_SETTINGS]: {
    key: string;
    value: SettingsRow;
  };
  [STORE_EXPENSES]: {
    key: string;
    value: Expense;
  };
  [STORE_WISHLIST]: {
    key: string;
    value: WishlistItem;
  };
}

let dbPromise: Promise<IDBPDatabase<BudgetDBSchema>> | null = null;

let bc: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!bc) {
    try {
      bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    } catch {
      return null;
    }
  }
  return bc;
}

function notifyDataChanged(): void {
  const ch = getBroadcastChannel();
  if (ch) {
    try {
      ch.postMessage({ type: 'changed' });
    } catch {
      console.warn('BroadcastChannel post failed');
    }
  }
}

export function subscribeDataChanged(cb: () => void): () => void {
  const ch = getBroadcastChannel();
  if (!ch) return () => {};
  const handler = (): void => {
    cb();
  };
  ch.addEventListener('message', handler);
  return () => {
    ch.removeEventListener('message', handler);
  };
}

export async function getDb(): Promise<IDBPDatabase<BudgetDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<BudgetDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        switch (oldVersion) {
          case 0: {
            db.createObjectStore(STORE_SETTINGS, { keyPath: 'id' });
            db.createObjectStore(STORE_EXPENSES, { keyPath: 'id' });
            db.createObjectStore(STORE_WISHLIST, { keyPath: 'id' });
            break;
          }
          default:
            break;
        }
      },
    });
  }
  return dbPromise;
}

export async function getSettings(): Promise<SettingsRow | undefined> {
  const db = await getDb();
  return db.get(STORE_SETTINGS, 'default');
}

export async function saveSettings(monthlyBudgetCents: number): Promise<void> {
  const db = await getDb();
  const row: SettingsRow = { id: 'default', monthlyBudget: monthlyBudgetCents };
  await db.put(STORE_SETTINGS, row);
  notifyDataChanged();
}

export async function addExpense(expense: Expense): Promise<void> {
  const db = await getDb();
  await db.put(STORE_EXPENSES, expense);
  notifyDataChanged();
}

export async function updateExpense(expense: Expense): Promise<void> {
  const db = await getDb();
  await db.put(STORE_EXPENSES, expense);
  notifyDataChanged();
}

export async function deleteExpense(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_EXPENSES, id);
  notifyDataChanged();
}

export async function getExpense(id: string): Promise<Expense | undefined> {
  const db = await getDb();
  return db.get(STORE_EXPENSES, id);
}

export async function getAllExpenses(): Promise<Expense[]> {
  const db = await getDb();
  return db.getAll(STORE_EXPENSES);
}

/** Expenses where date starts with yearMonth (YYYY-MM). */
export async function getExpensesForMonth(yearMonth: string): Promise<Expense[]> {
  const all = await getAllExpenses();
  return all.filter((e) => e.date.startsWith(yearMonth));
}

export async function addWishlistItem(item: WishlistItem): Promise<void> {
  const db = await getDb();
  await db.put(STORE_WISHLIST, item);
  notifyDataChanged();
}

export async function updateWishlistItem(item: WishlistItem): Promise<void> {
  const db = await getDb();
  await db.put(STORE_WISHLIST, item);
  notifyDataChanged();
}

export async function deleteWishlistItem(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_WISHLIST, id);
  notifyDataChanged();
}

export async function getAllWishlist(): Promise<WishlistItem[]> {
  const db = await getDb();
  return db.getAll(STORE_WISHLIST);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (): void => {
      const s = r.result as string;
      const idx = s.indexOf(',');
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    r.onerror = (): void => {
      reject(r.error ?? new Error('read failed'));
    };
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}

export async function exportBackup(): Promise<BackupPayload> {
  const db = await getDb();
  const settings = await db.get(STORE_SETTINGS, 'default');
  const expenses = await db.getAll(STORE_EXPENSES);
  const wishRaw = await db.getAll(STORE_WISHLIST);
  const wishlist: WishlistItemWire[] = [];
  for (const w of wishRaw) {
    const wire: WishlistItemWire = {
      id: w.id,
      title: w.title,
      url: w.url,
      priceCents: w.priceCents,
      createdAt: w.createdAt,
      reminderDate: w.reminderDate,
      notified: w.notified,
      purchased: w.purchased,
    };
    if (w.image) {
      try {
        wire.imageBase64 = await blobToBase64(w.image);
        wire.imageMime = w.image.type || 'image/jpeg';
      } catch (e) {
        console.warn('Skipping wishlist image in export', e);
      }
    }
    wishlist.push(wire);
  }
  return {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    settings: { monthlyBudget: settings?.monthlyBudget ?? 0 },
    expenses,
    wishlist,
  };
}

function isExpense(x: unknown): x is Expense {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.date === 'string' &&
    typeof o.amount === 'number' &&
    Number.isFinite(o.amount) &&
    typeof o.description === 'string' &&
    typeof o.createdAt === 'number'
  );
}

function isWishlistWire(x: unknown): x is WishlistItemWire {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.title === 'string' &&
    typeof o.createdAt === 'number' &&
    typeof o.reminderDate === 'number' &&
    typeof o.notified === 'boolean' &&
    typeof o.purchased === 'boolean' &&
    (o.url === undefined || typeof o.url === 'string')
  );
}

export function parseBackupJson(text: string): BackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Invalid JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Backup must be an object');
  }
  const o = parsed as Record<string, unknown>;
  if (o.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${String(o.version)}`);
  }
  if (typeof o.exportedAt !== 'number') {
    throw new Error('Missing exportedAt');
  }
  const st = o.settings;
  if (!st || typeof st !== 'object') {
    throw new Error('Missing settings');
  }
  const monthlyBudget = (st as { monthlyBudget?: unknown }).monthlyBudget;
  if (typeof monthlyBudget !== 'number' || !Number.isFinite(monthlyBudget)) {
    throw new Error('Invalid monthlyBudget');
  }
  if (!Array.isArray(o.expenses)) {
    throw new Error('Invalid expenses');
  }
  if (!Array.isArray(o.wishlist)) {
    throw new Error('Invalid wishlist');
  }
  for (const e of o.expenses) {
    if (!isExpense(e)) {
      throw new Error('Invalid expense entry');
    }
  }
  for (const w of o.wishlist) {
    if (!isWishlistWire(w)) {
      throw new Error('Invalid wishlist entry');
    }
  }
  return {
    version: BACKUP_VERSION,
    exportedAt: o.exportedAt,
    settings: { monthlyBudget },
    expenses: o.expenses as Expense[],
    wishlist: o.wishlist as WishlistItemWire[],
  };
}

/**
 * Replace all data atomically. On any failure, transaction aborts.
 */
export async function importBackup(payload: BackupPayload): Promise<void> {
  const db = await getDb();
  const wishlistItems: WishlistItem[] = payload.wishlist.map((w) => {
    const item: WishlistItem = {
      id: w.id,
      title: w.title,
      url: w.url,
      priceCents: w.priceCents,
      createdAt: w.createdAt,
      reminderDate: w.reminderDate,
      notified: w.notified,
      purchased: w.purchased,
    };
    if (w.imageBase64 && w.imageMime) {
      try {
        item.image = base64ToBlob(w.imageBase64, w.imageMime);
      } catch (e) {
        console.warn('Skipping corrupt wishlist image', e);
      }
    }
    return item;
  });

  const tx = db.transaction(
    [STORE_SETTINGS, STORE_EXPENSES, STORE_WISHLIST] as const,
    'readwrite',
  );

  await tx.objectStore(STORE_SETTINGS).clear();
  await tx.objectStore(STORE_EXPENSES).clear();
  await tx.objectStore(STORE_WISHLIST).clear();

  await tx.objectStore(STORE_SETTINGS).put({
    id: 'default',
    monthlyBudget: payload.settings.monthlyBudget,
  });

  for (const e of payload.expenses) {
    await tx.objectStore(STORE_EXPENSES).put(e);
  }
  for (const w of wishlistItems) {
    await tx.objectStore(STORE_WISHLIST).put(w);
  }

  await tx.done;
  notifyDataChanged();
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    [STORE_SETTINGS, STORE_EXPENSES, STORE_WISHLIST] as const,
    'readwrite',
  );
  await tx.objectStore(STORE_SETTINGS).clear();
  await tx.objectStore(STORE_EXPENSES).clear();
  await tx.objectStore(STORE_WISHLIST).clear();
  await tx.done;
  notifyDataChanged();
}

/** Delete DB and reset module handle (tests). */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      /* ignore */
    }
  }
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = (): void => {
      resolve();
    };
    req.onerror = (): void => {
      reject(req.error ?? new Error('deleteDatabase failed'));
    };
    req.onblocked = (): void => {
      resolve();
    };
  });
}
