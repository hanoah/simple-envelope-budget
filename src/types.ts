/** Single settings row in IndexedDB */
export interface SettingsRow {
  id: 'default';
  monthlyBudget: number; // cents
}

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // cents
  description: string;
  createdAt: number;
}

export interface WishlistItem {
  id: string;
  title: string;
  url?: string;
  image?: Blob;
  priceCents?: number;
  createdAt: number;
  reminderDate: number;
  notified: boolean;
  purchased: boolean;
}

export const BACKUP_VERSION = 1 as const;

/** Wire format for JSON backup (images as base64) */
export interface WishlistItemWire {
  id: string;
  title: string;
  url?: string;
  imageBase64?: string;
  imageMime?: string;
  priceCents?: number;
  createdAt: number;
  reminderDate: number;
  notified: boolean;
  purchased: boolean;
}

export interface BackupPayload {
  version: typeof BACKUP_VERSION;
  exportedAt: number;
  settings: { monthlyBudget: number };
  expenses: Expense[];
  wishlist: WishlistItemWire[];
}
