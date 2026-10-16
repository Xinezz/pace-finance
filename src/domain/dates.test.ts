import { describe, expect, it } from 'vitest';
import { addDays, addMonths, currentMonthKey, daysInMonth, diffDays, isValidDateStr, monthDiff, monthRange, todayStr, toDateStr, weekStartOf } from './dates';

describe('local date handling', () => {
  it('uses the local calendar day, not UTC', () => {
    // 00:30 local time on the 1st must still be "the 1st", whatever the UTC offset is.
    const d = new Date(2026, 9, 1, 0, 30);
    expect(todayStr(d)).toBe('2026-10-01');
    expect(currentMonthKey(d)).toBe('2026-10');
    // 23:59 on the last day of a month stays in that month.
    expect(todayStr(new Date(2026, 9, 31, 23, 59))).toBe('2026-10-31');
    expect(toDateStr(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });

  it('computes month boundaries', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(daysInMonth('2026-12')).toBe(31);
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-03', -15)).toBe('2024-12');
    expect(monthDiff('2025-11', '2026-02')).toBe(3);
  });

  it('adds days across month ends and DST', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2);
    expect(diffDays('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('finds the start of the week', () => {
    expect(weekStartOf('2026-10-15', 1)).toBe('2026-10-12'); // Thursday -> Monday
    expect(weekStartOf('2026-10-15', 0)).toBe('2026-10-11'); // -> Sunday
    expect(weekStartOf('2026-10-12', 1)).toBe('2026-10-12');
  });

  it('validates date strings', () => {
    expect(isValidDateStr('2026-02-29')).toBe(false);
    expect(isValidDateStr('2028-02-29')).toBe(true);
    expect(isValidDateStr('2026-13-01')).toBe(false);
    expect(isValidDateStr('15/10/2026')).toBe(false);
  });
});
