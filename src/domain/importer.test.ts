import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';
import { buildImportRows, guessMapping, parseImportDate, transactionsToCsv } from './importer';
import { SPECIAL } from './types';
import { dataWith, tx } from './testUtils';

describe('csv parsing', () => {
  it('handles quotes, embedded commas, newlines, CRLF, BOM and semicolons', () => {
    const text = '﻿Date,Description,Amount\r\n2026-10-01,"Lunch, with ""friends""",-12.50\r\n2026-10-02,"Two\nlines",5\r\n';
    expect(parseCsv(text)).toEqual([
      ['Date', 'Description', 'Amount'],
      ['2026-10-01', 'Lunch, with "friends"', '-12.50'],
      ['2026-10-02', 'Two\nlines', '5'],
    ]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('exports with quoting and protects against formula injection', () => {
    const csv = toCsv([['=SUM(A1)', 'a,b', 'ok']], [0, 1, 2]);
    expect(csv).toBe("'=SUM(A1),\"a,b\",ok");
  });
});

describe('date parsing', () => {
  it('reads ISO, day-first, month-first, and named months', () => {
    expect(parseImportDate('2026-10-05', 'iso')).toBe('2026-10-05');
    expect(parseImportDate('05/10/2026', 'dmy')).toBe('2026-10-05');
    expect(parseImportDate('05/10/2026', 'mdy')).toBe('2026-05-10');
    expect(parseImportDate('5 Oct 2026', 'dmy')).toBe('2026-10-05');
    expect(parseImportDate('Oct 5, 2026', 'mdy')).toBe('2026-10-05');
    expect(parseImportDate('31/02/2026', 'dmy')).toBeNull();
    expect(parseImportDate('not a date', 'dmy')).toBeNull();
  });
});

describe('import pipeline', () => {
  const headers = ['Date', 'Description', 'Debit', 'Credit', 'Category'];
  const opts = { dateFormat: 'dmy' as const, positiveIsExpense: false, accountId: SPECIAL.mainAccount };

  it('guesses a sensible column mapping', () => {
    expect(guessMapping(headers)).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3, category: 4 });
    expect(guessMapping(['Posted', 'Memo', 'Amount'])).toMatchObject({ date: 0, description: 1, amount: 2 });
  });

  it('validates rows and reports each problem', () => {
    const rows = [
      ['05/10/2026', 'Hawker lunch', '6.50', '', 'Food & Dining'],
      ['06/10/2026', 'Salary', '', '4,200.00', ''],
      ['99/10/2026', 'Bad date', '1', '', ''],
      ['07/10/2026', '', '1', '', ''],
      ['08/10/2026', 'No amount', '', '', ''],
      ['09/10/2026', 'ABC Store', '23.40', '', ''],
    ];
    const out = buildImportRows(rows, guessMapping(headers), opts, dataWith([]));
    expect(out.map((r) => r.status)).toEqual(['ok', 'ok', 'error', 'error', 'error', 'ok']);
    expect(out[0].tx).toMatchObject({ type: 'expense', amount: 650, categoryId: 'food', categorySource: 'manual' });
    expect(out[1].tx).toMatchObject({ type: 'income', amount: 420000, categoryId: 'salary' });
    expect(out[2].errors[0]).toMatch(/date/i);
    expect(out[3].errors[0]).toMatch(/description/i);
    expect(out[5].tx).toMatchObject({ categoryId: 'other', categorySource: 'none' });
  });

  it('flags rows already present, but keeps genuine repeats from the same file', () => {
    const existing = dataWith([tx({ date: '2026-10-05', amount: 650, description: 'Hawker lunch' })]);
    const rows = [
      ['05/10/2026', 'Hawker lunch', '6.50', '', ''],
      ['05/10/2026', 'Hawker lunch', '6.50', '', ''], // a second, genuine purchase the same day
      ['05/10/2026', 'Hawker lunch', '6.50', '', ''],
    ];
    const out = buildImportRows(rows, guessMapping(headers), opts, existing);
    expect(out.map((r) => r.status)).toEqual(['duplicate', 'ok', 'ok']);
    expect(new Set(out.filter((r) => r.tx).map((r) => r.tx!.importHash)).size).toBe(3);
  });

  it('is idempotent: importing the same file twice adds nothing the second time', () => {
    const rows = [['05/10/2026', 'Lunch', '6.50', '', ''], ['06/10/2026', 'Lunch', '6.50', '', '']];
    const first = buildImportRows(rows, guessMapping(headers), opts, dataWith([]));
    const after = dataWith(first.map((r) => r.tx!));
    const second = buildImportRows(rows, guessMapping(headers), opts, after);
    expect(second.every((r) => r.status === 'duplicate')).toBe(true);
  });

  it('supports a single signed amount column and credit-card style statements', () => {
    const rows = [['2026-10-05', 'Coffee', '-5.50'], ['2026-10-06', 'Refund', '12.00']];
    const m = guessMapping(['Date', 'Description', 'Amount']);
    const normal = buildImportRows(rows, m, { ...opts, dateFormat: 'iso' }, dataWith([]));
    expect(normal.map((r) => r.tx?.type)).toEqual(['expense', 'income']);
    const card = buildImportRows([['2026-10-05', 'Coffee', '5.50']], m, { ...opts, dateFormat: 'iso', positiveIsExpense: true }, dataWith([]));
    expect(card[0].tx?.type).toBe('expense');
  });
});

describe('export', () => {
  it('writes a header and one line per transaction', () => {
    const data = dataWith([tx({ date: '2026-10-05', amount: 650, description: 'Lunch, nice', tags: ['a', 'b'] })]);
    const csv = transactionsToCsv(data.transactions, data);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Date,Type,Description,Amount,Category,Payment method,Account,To account,Tags,Notes');
    expect(lines[1]).toContain('"Lunch, nice",6.50,Food & Dining');
    expect(lines[1]).toContain('a; b');
  });
});
