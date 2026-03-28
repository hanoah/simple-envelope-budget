import { describe, expect, it, afterEach } from 'vitest';
import {
  centsToDollarsString,
  computeRemainingEnvelope,
  dollarsToCents,
  formatCurrency,
  getDayOfMonth,
  getDaysInMonth,
  getToday,
  getYearMonthFromDate,
  parseYearMonth,
  setTodayOverride,
} from './utils.ts';

describe('dollarsToCents', () => {
  it('converts common amounts', () => {
    expect(dollarsToCents('12.50')).toBe(1250);
    expect(dollarsToCents(0.01)).toBe(1);
    expect(dollarsToCents(999.99)).toBe(99999);
  });

  it('handles negatives', () => {
    expect(dollarsToCents('-5')).toBe(-500);
  });

  it('returns NaN for invalid', () => {
    expect(Number.isNaN(dollarsToCents('abc'))).toBe(true);
  });
});

describe('getToday / override', () => {
  afterEach(() => {
    setTodayOverride(null);
  });

  it('uses override when set', () => {
    setTodayOverride(() => '2026-03-15');
    expect(getToday()).toBe('2026-03-15');
  });
});

describe('calendar helpers', () => {
  it('getDaysInMonth leap February', () => {
    expect(getDaysInMonth(2024, 1)).toBe(29);
  });

  it('getDaysInMonth non-leap February', () => {
    expect(getDaysInMonth(2025, 1)).toBe(28);
  });

  it('getDayOfMonth', () => {
    expect(getDayOfMonth('2026-03-07')).toBe(7);
  });

  it('getYearMonthFromDate', () => {
    expect(getYearMonthFromDate('2026-03-07')).toBe('2026-03');
  });

  it('parseYearMonth', () => {
    expect(parseYearMonth('2026-03')).toEqual({ year: 2026, monthIndex: 2 });
  });
});

describe('computeRemainingEnvelope', () => {
  it('matches envelope model mid-month', () => {
    const monthly = 310_00; // $310
    const ym = '2026-03';
    const today = '2026-03-10';
    const spent = 50_00;
    const r = computeRemainingEnvelope(monthly, ym, today, spent);
    const dailyBase = monthly / 31;
    const expected = Math.round(dailyBase * 10) - spent;
    expect(r).toBe(expected);
  });

  it('goes negative when overspent', () => {
    const r = computeRemainingEnvelope(100_00, '2026-03', '2026-03-15', 1_000_000);
    expect(r).toBeLessThan(0);
  });
});

describe('formatCurrency', () => {
  it('formats zero', () => {
    expect(formatCurrency(0)).toMatch(/0/);
  });
});

describe('centsToDollarsString', () => {
  it('formats two decimals', () => {
    expect(centsToDollarsString(1250)).toBe('12.50');
  });
});
