import { describe, expect, it } from 'vitest';
import { categoryBreakdown, summarize } from '../domain/calc';
import { makeRule, needsCategory } from '../domain/categorize';
import { createEmptyData } from '../domain/defaults';
import { createDemoData } from '../domain/demo';
import { dataWith, tx } from '../domain/testUtils';
import { SPECIAL, type Category } from '../domain/types';
import { reducer } from './reducer';

const custom: Category = { id: 'c1', name: 'Pets', icon: '🐶', color: '#A8B5A0', type: 'expense', builtin: false };

describe('adding and editing transactions', () => {
  it('new uncategorized expenses start in "Needs Your Attention"', () => {
    const d = reducer(createEmptyData(), { type: 'addTx', tx: tx({ id: 'a', description: 'ABC Store', amount: 2000, categoryId: 'other', categorySource: 'none' }) });
    expect(d.transactions.filter(needsCategory)).toHaveLength(1);
  });

  it('manually choosing a category makes it manual and updates breakdowns immediately', () => {
    let d = dataWith([tx({ id: 'a', description: 'ABC Store', amount: 2000, categoryId: 'other', categorySource: 'none', date: '2026-10-05' })]);
    expect(categoryBreakdown(d.transactions).rows[0].categoryId).toBe('other');
    d = reducer(d, { type: 'updateTx', id: 'a', patch: { categoryId: 'shopping' } });
    expect(d.transactions[0]).toMatchObject({ categoryId: 'shopping', categorySource: 'manual' });
    expect(categoryBreakdown(d.transactions).rows[0].categoryId).toBe('shopping');
    expect(d.transactions.filter(needsCategory)).toHaveLength(0);
  });

  it('editing the description never re-categorizes a manual choice', () => {
    let d = dataWith([tx({ id: 'a', description: 'Odd name', amount: 100, categoryId: 'gifts', categorySource: 'manual' })]);
    d = reducer(d, { type: 'updateTx', id: 'a', patch: { description: 'NTUC FairPrice' } });
    expect(d.transactions[0]).toMatchObject({ categoryId: 'gifts', categorySource: 'manual' });
  });

  it('editing the description of an automatic one lets the suggestion follow', () => {
    let d = dataWith([tx({ id: 'a', description: 'Mystery', amount: 100, categoryId: 'other', categorySource: 'none' })]);
    d = reducer(d, { type: 'updateTx', id: 'a', patch: { description: 'NTUC FairPrice' } });
    expect(d.transactions[0]).toMatchObject({ categoryId: 'groceries', categorySource: 'auto' });
  });

  it('keeps categories valid when the type changes', () => {
    let d = dataWith([tx({ id: 'a', description: 'Thing', amount: 100, categoryId: 'food', categorySource: 'manual' })]);
    d = reducer(d, { type: 'updateTx', id: 'a', patch: { type: 'income' } });
    expect(d.transactions[0].categoryId).toBe('other'); // "Food" is not an income category
    expect(d.transactions[0].categorySource).toBe('none');
  });

  it('recalculates totals after delete', () => {
    let d = dataWith([tx({ id: 'a', amount: 1000 }), tx({ id: 'b', amount: 500 })]);
    expect(summarize(d.transactions).expenses).toBe(1500);
    d = reducer(d, { type: 'deleteTxs', ids: ['a'] });
    expect(summarize(d.transactions).expenses).toBe(500);
  });
});

describe('bulk categorization', () => {
  it('assigns many at once and skips transfers and incompatible types', () => {
    let d = dataWith([
      tx({ id: 'a', amount: 1, categoryId: 'other', categorySource: 'none' }),
      tx({ id: 'b', amount: 1, categoryId: 'other', categorySource: 'none' }),
      tx({ id: 'inc', type: 'income', amount: 1, categoryId: 'other', categorySource: 'none' }),
      tx({ id: 'tr', type: 'transfer', amount: 1, categoryId: 'savings', accountId: SPECIAL.mainAccount, toAccountId: SPECIAL.savingsAccount }),
    ]);
    d = reducer(d, { type: 'setCategory', ids: ['a', 'b', 'inc', 'tr'], categoryId: 'shopping' });
    const by = Object.fromEntries(d.transactions.map((t) => [t.id, t]));
    expect(by.a).toMatchObject({ categoryId: 'shopping', categorySource: 'manual' });
    expect(by.b).toMatchObject({ categoryId: 'shopping', categorySource: 'manual' });
    expect(by.inc.categoryId).toBe('other'); // shopping is not an income category
    expect(by.tr.categoryId).toBe('savings');
  });

  it('confirming auto suggestions turns them into manual choices', () => {
    let d = dataWith([tx({ id: 'a', amount: 1, categoryId: 'groceries', categorySource: 'auto' })]);
    d = reducer(d, { type: 'confirmAuto', ids: ['a'] });
    expect(d.transactions[0].categorySource).toBe('manual');
  });
});

describe('rules', () => {
  it('adding a rule applies to uncategorized transactions only', () => {
    let d = dataWith([
      tx({ id: 'a', description: 'ABC Store', amount: 1, categoryId: 'other', categorySource: 'none' }),
      tx({ id: 'b', description: 'ABC Store', amount: 1, categoryId: 'gifts', categorySource: 'manual' }),
    ]);
    d = reducer(d, { type: 'addRule', rule: makeRule('abc store', 'shopping'), applyToExisting: true });
    const by = Object.fromEntries(d.transactions.map((t) => [t.id, t]));
    expect(by.a.categoryId).toBe('shopping');
    expect(by.b.categoryId).toBe('gifts');
    expect(d.rules).toHaveLength(1);
  });
});

describe('custom categories', () => {
  it('can be renamed, recolored and deleted; deleting returns its transactions to Needs Attention', () => {
    let d = reducer(dataWith([tx({ id: 'a', amount: 1000, categoryId: 'c1' })], { budgets: [{ categoryId: 'c1', amount: 5000 }], rules: [makeRule('rex', 'c1')] }), { type: 'addCategory', category: custom });
    d = reducer(d, { type: 'updateCategory', id: 'c1', patch: { name: 'Pet care', color: '#E8B9A5', icon: '🐱' } });
    expect(d.categories.find((c) => c.id === 'c1')).toMatchObject({ name: 'Pet care', color: '#E8B9A5', icon: '🐱' });
    d = reducer(d, { type: 'deleteCategory', id: 'c1' });
    expect(d.categories.some((c) => c.id === 'c1')).toBe(false);
    expect(d.transactions[0]).toMatchObject({ categoryId: 'other', categorySource: 'none' });
    expect(d.budgets).toHaveLength(0);
    expect(d.rules).toHaveLength(0);
  });

  it('built-in categories can change look but not name, and cannot be deleted', () => {
    let d = createEmptyData();
    d = reducer(d, { type: 'updateCategory', id: 'food', patch: { name: 'Hacked', color: '#000000' } });
    expect(d.categories.find((c) => c.id === 'food')).toMatchObject({ name: 'Food & Dining', color: '#000000' });
    expect(reducer(d, { type: 'deleteCategory', id: 'food' }).categories.some((c) => c.id === 'food')).toBe(true);
    expect(reducer(d, { type: 'deleteCategory', id: 'other' }).categories.some((c) => c.id === 'other')).toBe(true);
  });
});

describe('goals', () => {
  it('deleting a goal keeps the transfers that funded it', () => {
    const base = createEmptyData();
    let d = dataWith(
      [tx({ id: 't', type: 'transfer', amount: 5000, accountId: SPECIAL.mainAccount, toAccountId: SPECIAL.savingsAccount, goalId: 'g' })],
      { goals: [{ id: 'g', name: 'G', target: 1, startingAmount: 0, icon: '🎯', color: '#fff', startDate: '2026-01-01' }], goalEntries: [{ id: 'e', goalId: 'g', amount: 5, date: '2026-01-01' }], accounts: base.accounts },
    );
    d = reducer(d, { type: 'deleteGoal', id: 'g' });
    expect(d.goals).toHaveLength(0);
    expect(d.goalEntries).toHaveLength(0);
    expect(d.transactions).toHaveLength(1);
    expect(d.transactions[0].goalId).toBeUndefined();
  });
});

describe('demo data', () => {
  it('clearing demo removes demo records, keeps the user\'s own, and resets balances and budgets', () => {
    let d = createDemoData('2026-10-15');
    const mine = tx({ id: 'mine', description: 'My coffee', amount: 500, date: '2026-10-14' });
    d = reducer(d, { type: 'addTx', tx: mine });
    d = reducer(d, { type: 'clearDemo' });
    expect(d.transactions.map((t) => t.id)).toEqual(['mine']);
    expect(d.goals).toHaveLength(0);
    expect(d.goalEntries).toHaveLength(0);
    expect(d.budgets).toHaveLength(0);
    expect(d.accounts.every((a) => a.openingBalance === 0)).toBe(true);
    expect(d.meta.mode).toBe('user');
    expect(d.meta.onboarded).toBe(true);
  });

  it('clearing demo with no personal entries sends the user to onboarding', () => {
    const d = reducer(createDemoData('2026-10-15'), { type: 'clearDemo' });
    expect(d.transactions).toHaveLength(0);
    expect(d.meta.onboarded).toBe(false);
  });
});

describe('currency', () => {
  it('rescales stored amounts when decimal precision changes, keeping the nominal numbers', () => {
    let d = dataWith([tx({ id: 'a', amount: 1250 })], { budgets: [{ categoryId: 'food', amount: 40000 }] });
    d = reducer(d, { type: 'changeCurrency', currency: 'JPY' });
    expect(d.settings.currency).toBe('JPY');
    expect(d.transactions[0].amount).toBe(13);
    expect(d.budgets[0].amount).toBe(400);
  });

  it('leaves amounts alone between two-decimal currencies', () => {
    const d = reducer(dataWith([tx({ id: 'a', amount: 1250 })]), { type: 'changeCurrency', currency: 'USD' });
    expect(d.transactions[0].amount).toBe(1250);
  });
});

describe('accounts', () => {
  it('refuses to delete an account that has transactions', () => {
    const d = dataWith([tx({ amount: 1 })]);
    expect(reducer(d, { type: 'deleteAccount', id: SPECIAL.mainAccount }).accounts).toHaveLength(2);
    const added = reducer(d, { type: 'addAccount', account: { id: 'x', name: 'Cash', kind: 'spending', openingBalance: 0 } });
    expect(reducer(added, { type: 'deleteAccount', id: 'x' }).accounts).toHaveLength(2);
  });
});

describe('structural sharing', () => {
  it('keeps unchanged transactions identical so storage only writes what changed', () => {
    const d = dataWith([tx({ id: 'a', amount: 1 }), tx({ id: 'b', amount: 2 })]);
    const next = reducer(d, { type: 'updateTx', id: 'a', patch: { notes: 'hi' } });
    expect(next.transactions[1]).toBe(d.transactions[1]);
    expect(next.transactions[0]).not.toBe(d.transactions[0]);
  });
});
