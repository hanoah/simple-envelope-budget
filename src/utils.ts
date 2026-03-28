/** Override for tests: return YYYY-MM-DD */
let todayOverride: (() => string) | null = null;

export function setTodayOverride(fn: (() => string) | null): void {
  todayOverride = fn;
}

/** Local calendar date as YYYY-MM-DD (not UTC). */
export function getToday(): string {
  if (todayOverride) {
    return todayOverride();
  }
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Round half-up to integer cents from a dollar string or number. */
export function dollarsToCents(input: string | number): number {
  const n = typeof input === 'string' ? parseFloat(input.replace(/,/g, '')) : input;
  if (!Number.isFinite(n)) {
    return NaN;
  }
  return Math.round(n * 100 + Number.EPSILON * (n >= 0 ? 1 : -1));
}

export function centsToDollarsString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** All amounts are stored as integer cents; display uses CAD. */
export const APP_CURRENCY = 'CAD' as const;
export const APP_CURRENCY_LOCALE = 'en-CA';

const currencyFormatter = new Intl.NumberFormat(APP_CURRENCY_LOCALE, {
  style: 'currency',
  currency: APP_CURRENCY,
});

export function formatCurrency(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

export function getYearMonthFromDate(ymd: string): string {
  return ymd.slice(0, 7);
}

export function getDaysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/** month YYYY-MM, day 1-indexed */
export function getDayOfMonth(ymd: string): number {
  const parts = ymd.split('-').map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  if (!y || !m || !d) return 1;
  return d;
}

export function parseYearMonth(ym: string): { year: number; monthIndex: number } {
  const [y, m] = ym.split('-').map(Number);
  return { year: y ?? new Date().getFullYear(), monthIndex: (m ?? 1) - 1 };
}

/**
 * Envelope remaining for current calendar month:
 * dailyBase * dayOfMonth - totalSpentThisMonth
 */
export function computeRemainingEnvelope(
  monthlyBudgetCents: number,
  yearMonth: string,
  todayYmd: string,
  totalSpentThisMonthCents: number,
): number {
  const { year, monthIndex } = parseYearMonth(yearMonth);
  const dim = getDaysInMonth(year, monthIndex);
  if (dim <= 0) return 0;
  const dailyBase = monthlyBudgetCents / dim;
  const dom = getDayOfMonth(todayYmd);
  const allowanceSoFar = Math.round(dailyBase * dom);
  return allowanceSoFar - totalSpentThisMonthCents;
}

export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;

export const WISHLIST_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

export const STORAGE_LAST_EXPORT = 'budget_last_export_at';
