import { describe, expect, it } from 'vitest';
import { applyRuleToExisting, findSimilar, makeRule, matchRule, needsCategory, normalizeDescription, ruleKeyFor, shouldOfferRemember, suggestCategory } from './categorize';
import { createEmptyData } from './defaults';
import { dataWith, tx } from './testUtils';

describe('normalizeDescription', () => {
  it('strips digits, punctuation, and case so similar descriptions share a key', () => {
    expect(normalizeDescription('ABC Store #12')).toBe('abc store');
    expect(normalizeDescription('Transfer 003')).toBe('transfer');
    expect(normalizeDescription("McDonald's")).toBe('mcdonalds');
    expect(ruleKeyFor('8821')).toBeNull();
  });
});

describe('suggestCategory', () => {
  const base = createEmptyData();

  it('recognises well-known merchants', () => {
    expect(suggestCategory('NTUC FairPrice', 'expense', base)).toEqual({ categoryId: 'groceries', source: 'auto' });
    expect(suggestCategory('GrabFood dinner', 'expense', base).categoryId).toBe('food');
    expect(suggestCategory('Grab ride', 'expense', base).categoryId).toBe('transport');
    expect(suggestCategory('Netflix', 'expense', base).categoryId).toBe('entertainment');
    expect(suggestCategory("McDonald's", 'expense', base).categoryId).toBe('food');
  });

  it('leaves unknown descriptions uncategorized', () => {
    expect(suggestCategory('ABC Store', 'expense', base)).toEqual({ categoryId: 'other', source: 'none' });
    expect(suggestCategory('Online Purchase', 'expense', base).source).toBe('none');
    expect(suggestCategory('Transfer 003', 'expense', base).source).toBe('none');
  });

  it('only suggests categories that fit the transaction type', () => {
    expect(suggestCategory('Salary', 'income', base).categoryId).toBe('salary');
    // "salary" is an income category, so it must never be suggested for an expense.
    expect(suggestCategory('Salary advance repayment', 'expense', base).source).toBe('none');
  });

  it('can be switched off, and user rules still apply', () => {
    const off = { ...base, settings: { ...base.settings, autoSuggest: false } };
    expect(suggestCategory('NTUC FairPrice', 'expense', off).source).toBe('none');
    const withRule = { ...off, rules: [makeRule('abc store', 'shopping')] };
    expect(suggestCategory('ABC Store #7', 'expense', withRule)).toEqual({ categoryId: 'shopping', source: 'rule' });
  });

  it('prefers a remembered rule over a built-in keyword', () => {
    const data = { ...base, rules: [makeRule('grab', 'travel')] };
    expect(suggestCategory('Grab ride', 'expense', data)).toEqual({ categoryId: 'travel', source: 'rule' });
  });
});

describe('manual choices are never overridden', () => {
  it('applying a new rule to existing transactions skips manual ones', () => {
    const cats = createEmptyData().categories;
    const rule = makeRule('abc store', 'shopping');
    const txs = [
      tx({ id: 'm', description: 'ABC Store', amount: 100, categoryId: 'gifts', categorySource: 'manual' }),
      tx({ id: 'n', description: 'ABC Store 2', amount: 100, categoryId: 'other', categorySource: 'none' }),
      tx({ id: 'a', description: 'abc store', amount: 100, categoryId: 'food', categorySource: 'auto' }),
      tx({ id: 'x', description: 'Something else', amount: 100, categoryId: 'other', categorySource: 'none' }),
    ];
    const { txs: out, changed } = applyRuleToExisting(txs, rule, cats);
    const byId = Object.fromEntries(out.map((t) => [t.id, t]));
    expect(changed).toBe(2);
    expect(byId.m.categoryId).toBe('gifts');
    expect(byId.m.categorySource).toBe('manual');
    expect(byId.n.categoryId).toBe('shopping');
    expect(byId.a.categoryId).toBe('shopping');
    expect(byId.x.categoryId).toBe('other');
  });

  it('a rule matches whole words only', () => {
    const cats = createEmptyData().categories;
    expect(matchRule('Grabfood', [makeRule('grab', 'transport')], cats, 'expense')).toBeNull();
    expect(matchRule('Grab ride 55', [makeRule('grab', 'transport')], cats, 'expense')).not.toBeNull();
  });
});

describe('remembering preferences', () => {
  it('offers after a second manual choice for the same description', () => {
    const txs = [
      tx({ description: 'ABC Store', amount: 1, categoryId: 'shopping', categorySource: 'manual' }),
      tx({ description: 'ABC Store #2', amount: 1, categoryId: 'shopping', categorySource: 'manual' }),
    ];
    expect(shouldOfferRemember(txs.slice(0, 1), [], 'ABC Store', 'shopping').offer).toBe(false);
    expect(shouldOfferRemember(txs, [], 'ABC Store', 'shopping').offer).toBe(true);
    expect(shouldOfferRemember(txs, [makeRule('abc store', 'shopping')], 'ABC Store', 'shopping').offer).toBe(false);
  });

  it('finds similar transactions and flags the ones that need a category', () => {
    const txs = [tx({ id: '1', description: 'Transfer 003', amount: 1, categorySource: 'none' }), tx({ id: '2', description: 'transfer 004', amount: 1, categorySource: 'none' }), tx({ id: '3', description: 'Lunch', amount: 1 })];
    expect(findSimilar(txs, 'Transfer 003', '1').map((t) => t.id)).toEqual(['2']);
    expect(txs.filter(needsCategory)).toHaveLength(2);
  });
});

describe('data helpers', () => {
  it('dataWith builds a full app state', () => {
    expect(dataWith([]).categories.length).toBeGreaterThanOrEqual(14);
  });
});
