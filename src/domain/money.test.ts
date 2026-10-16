import { describe, expect, it } from 'vitest';
import { currencyDecimals, formatMoney, formatPct, minorToInput, parseAmount, rescaleMinor, safePct } from './money';

describe('parseAmount', () => {
  it('parses plain and decorated amounts into integer minor units', () => {
    expect(parseAmount('12.50', 'SGD')).toBe(1250);
    expect(parseAmount('$12', 'SGD')).toBe(1200);
    expect(parseAmount('S$ 1,234.56', 'SGD')).toBe(123456);
    expect(parseAmount('1234,56', 'SGD')).toBe(123456);
    expect(parseAmount('0.1', 'SGD')).toBe(10);
    expect(parseAmount('.5', 'SGD')).toBe(50);
  });

  it('avoids floating point drift', () => {
    expect(parseAmount('19.99', 'SGD')).toBe(1999);
    expect(parseAmount('1.15', 'SGD')).toBe(115);
    expect(parseAmount('4.35', 'SGD')).toBe(435);
    expect(parseAmount('0.07', 'SGD')).toBe(7);
  });

  it('handles negatives and brackets', () => {
    expect(parseAmount('-12.30', 'SGD')).toBe(-1230);
    expect(parseAmount('(45.00)', 'SGD')).toBe(-4500);
  });

  it('treats a lone comma with three digits as a thousands separator', () => {
    expect(parseAmount('1,234', 'SGD')).toBe(123400);
    expect(parseAmount('1,234,567.89', 'SGD')).toBe(123456789);
  });

  it('rejects junk and over-precise values', () => {
    expect(parseAmount('', 'SGD')).toBeNull();
    expect(parseAmount('abc', 'SGD')).toBeNull();
    expect(parseAmount('12.345', 'SGD')).toBeNull();
    expect(parseAmount('12.340', 'SGD')).toBe(1234);
  });

  it('respects zero-decimal currencies', () => {
    expect(currencyDecimals('JPY')).toBe(0);
    expect(parseAmount('1500', 'JPY')).toBe(1500);
    expect(parseAmount('1500.5', 'JPY')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats minor units as currency', () => {
    expect(formatMoney(123456, 'SGD')).toBe('S$1,234.56');
    expect(formatMoney(123456, 'USD')).toBe('$1,234.56');
    expect(formatMoney(-50000, 'SGD', { trimWhole: true })).toBe('-S$500');
    expect(formatMoney(1500, 'JPY')).toBe('¥1,500');
    expect(formatMoney(-500, 'SGD')).toMatch(/^-/);
    expect(formatMoney(500, 'SGD', { signed: true })).toMatch(/^\+/);
  });

  it('round-trips through the input representation', () => {
    for (const v of [0, 5, 99, 100, 123456, -250]) {
      expect(parseAmount(minorToInput(v, 'SGD'), 'SGD')).toBe(v);
    }
  });

  it('never prints NaN or Infinity', () => {
    expect(formatPct(null)).toBe('-');
    expect(formatPct(NaN)).toBe('-');
    expect(formatPct(Infinity)).toBe('-');
    expect(formatPct(28.4)).toBe('28%');
    expect(formatMoney(NaN, 'SGD')).toBe('-');
  });
});

describe('safePct', () => {
  it('returns null instead of dividing by zero', () => {
    expect(safePct(5, 0)).toBeNull();
    expect(safePct(5, -10)).toBeNull();
    expect(safePct(50, 200)).toBe(25);
  });
});

describe('rescaleMinor', () => {
  it('keeps the nominal number when decimals change', () => {
    expect(rescaleMinor(1250, 2, 0)).toBe(13);
    expect(rescaleMinor(1250, 2, 2)).toBe(1250);
    expect(rescaleMinor(15, 0, 2)).toBe(1500);
    expect(rescaleMinor(-1250, 2, 0)).toBe(-13);
  });
});
