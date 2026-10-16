import { needsCategory } from './categorize';
import type { Category, Transaction, TxType } from './types';

export interface TxFilter {
  q: string;
  type: 'all' | TxType;
  /** 'all', 'uncategorized' (still needs a category), or a category id. */
  categoryId: string;
  paymentMethod: string;
  tag: string;
  /** Inclusive local dates, 'YYYY-MM-DD'. */
  from?: string;
  to?: string;
}

export const EMPTY_FILTER: TxFilter = { q: '', type: 'all', categoryId: 'all', paymentMethod: 'all', tag: 'all' };

export function isFilterActive(f: TxFilter, ignoreDates = false): boolean {
  return !!f.q.trim() || f.type !== 'all' || f.categoryId !== 'all' || f.paymentMethod !== 'all' || f.tag !== 'all' || (!ignoreDates && !!(f.from || f.to));
}

export function filterTransactions(txs: Transaction[], f: TxFilter, categories: Category[]): Transaction[] {
  const catName = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));
  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return txs.filter((t) => {
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.type !== 'all' && t.type !== f.type) return false;
    if (f.categoryId === 'uncategorized') {
      if (!needsCategory(t)) return false;
    } else if (f.categoryId !== 'all' && t.categoryId !== f.categoryId) return false;
    if (f.paymentMethod !== 'all') {
      if (f.paymentMethod === 'none' ? !!t.paymentMethod : t.paymentMethod !== f.paymentMethod) return false;
    }
    if (f.tag !== 'all' && !t.tags.includes(f.tag)) return false;
    if (terms.length) {
      const hay = [t.description, t.notes ?? '', t.paymentMethod ?? '', t.tags.join(' '), catName.get(t.categoryId) ?? '', (t.amount / 100).toFixed(2), t.date].join(' ').toLowerCase();
      if (!terms.every((term) => hay.includes(term))) return false;
    }
    return true;
  });
}

export type SortKey = 'date' | 'amount' | 'description' | 'category';
export type SortDir = 'asc' | 'desc';

export function sortTransactions(txs: Transaction[], key: SortKey, dir: SortDir, categories: Category[]): Transaction[] {
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const sign = dir === 'asc' ? 1 : -1;
  const cmp = (a: Transaction, b: Transaction): number => {
    switch (key) {
      case 'amount':
        return a.amount - b.amount;
      case 'description':
        return a.description.localeCompare(b.description, undefined, { sensitivity: 'base' });
      case 'category':
        return (catName.get(a.categoryId) ?? '').localeCompare(catName.get(b.categoryId) ?? '');
      default:
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    }
  };
  return [...txs].sort((a, b) => sign * cmp(a, b) || b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1));
}
