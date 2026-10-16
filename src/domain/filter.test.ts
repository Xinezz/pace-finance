import { describe, expect, it } from 'vitest';
import { createEmptyData } from './defaults';
import { EMPTY_FILTER, filterTransactions, sortTransactions } from './filter';
import { tx } from './testUtils';

const cats = createEmptyData().categories;
const txs = [
  tx({ id: 'a', description: 'Hawker lunch', amount: 650, date: '2026-10-05', categoryId: 'food', paymentMethod: 'Cash', tags: ['work'] }),
  tx({ id: 'b', description: 'Salary', type: 'income', amount: 420000, date: '2026-10-03', categoryId: 'salary', paymentMethod: 'Bank transfer' }),
  tx({ id: 'c', description: 'ABC Store', amount: 2340, date: '2026-09-20', categoryId: 'other', categorySource: 'none' }),
  tx({ id: 'd', description: 'Grab ride', amount: 1200, date: '2026-10-31', categoryId: 'transport', notes: 'airport run' }),
];
const ids = (l: typeof txs) => l.map((t) => t.id);

describe('filterTransactions', () => {
  it('returns everything for an empty filter', () => {
    expect(ids(filterTransactions(txs, EMPTY_FILTER, cats))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters by inclusive date range (month boundaries are exact)', () => {
    expect(ids(filterTransactions(txs, { ...EMPTY_FILTER, from: '2026-10-01', to: '2026-10-31' }, cats))).toEqual(['a', 'b', 'd']);
    expect(ids(filterTransactions(txs, { ...EMPTY_FILTER, from: '2026-10-31', to: '2026-10-31' }, cats))).toEqual(['d']);
  });

  it('filters by type, category, payment method and tag', () => {
    expect(ids(filterTransactions(txs, { ...EMPTY_FILTER, type: 'income' }, cats))).toEqual(['b']);
    expect(ids(filterTransactions(txs, { ...EMPTY_FILTER, categoryId: 'transport' }, cats))).toEqual(['d']);
    expect(ids(filterTransactions(txs, { ...EMPTY_FILTER, paymentMethod: 'Cash' }, cats))).toEqual(['a']);
    expect(ids(filterTransactions(txs, { ...EMPTY_FILTER, paymentMethod: 'none' }, cats))).toEqual(['c', 'd']);
    expect(ids(filterTransactions(txs, { ...EMPTY_FILTER, tag: 'work' }, cats))).toEqual(['a']);
  });

  it('can show only transactions that still need a category', () => {
    expect(ids(filterTransactions(txs, { ...EMPTY_FILTER, categoryId: 'uncategorized' }, cats))).toEqual(['c']);
  });

  it('searches description, notes, category name, tags and amount', () => {
    expect(ids(filterTransactions(txs, { ...EMPTY_FILTER, q: 'lunch' }, cats))).toEqual(['a']);
    expect(ids(filterTransactions(txs, { ...EMPTY_FILTER, q: 'airport' }, cats))).toEqual(['d']);
    expect(ids(filterTransactions(txs, { ...EMPTY_FILTER, q: 'transport' }, cats))).toEqual(['d']);
    expect(ids(filterTransactions(txs, { ...EMPTY_FILTER, q: '23.40' }, cats))).toEqual(['c']);
    expect(ids(filterTransactions(txs, { ...EMPTY_FILTER, q: 'work cash' }, cats))).toEqual(['a']);
    expect(ids(filterTransactions(txs, { ...EMPTY_FILTER, q: 'nothing matches' }, cats))).toEqual([]);
  });
});

describe('sortTransactions', () => {
  it('sorts by date, amount, description and category in both directions', () => {
    expect(ids(sortTransactions(txs, 'date', 'desc', cats))).toEqual(['d', 'a', 'b', 'c']);
    expect(ids(sortTransactions(txs, 'date', 'asc', cats))).toEqual(['c', 'b', 'a', 'd']);
    expect(ids(sortTransactions(txs, 'amount', 'desc', cats))).toEqual(['b', 'c', 'd', 'a']);
    expect(ids(sortTransactions(txs, 'description', 'asc', cats))).toEqual(['c', 'd', 'a', 'b']);
    expect(ids(sortTransactions(txs, 'category', 'asc', cats))).toEqual(['a', 'c', 'b', 'd']);
  });

  it('does not mutate its input', () => {
    const copy = [...txs];
    sortTransactions(txs, 'amount', 'asc', cats);
    expect(txs).toEqual(copy);
  });
});
