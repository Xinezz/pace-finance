import { describe, expect, it } from 'vitest';
import {
  balanceSummary,
  budgetStatus,
  budgetSummary,
  buildBuckets,
  categoryBreakdown,
  categoryTrends,
  comparisonFor,
  crossedMilestone,
  detectRecurring,
  goalProgress,
  goalSaved,
  projectMonthEnd,
  savingsOverview,
  savingsTargetStatus,
  summarize,
  summarizeMonth,
  unusualDays,
} from './calc';
import { createEmptyData } from './defaults';
import { generateInsights } from './insights';
import { dataWith, tx } from './testUtils';
import { SPECIAL, type Goal } from './types';

const SAV = SPECIAL.savingsAccount;
const MAIN = SPECIAL.mainAccount;

describe('summarize (income, expenses, net, savings rate)', () => {
  it('follows the documented formulas', () => {
    const s = summarize([
      tx({ type: 'income', date: '2026-10-03', amount: 400000 }),
      tx({ date: '2026-10-04', amount: 30000 }),
      tx({ date: '2026-10-05', amount: 20000 }),
    ]);
    expect(s.income).toBe(400000);
    expect(s.expenses).toBe(50000);
    expect(s.net).toBe(350000);
    expect(s.savingsRate).toBeCloseTo(87.5);
  });

  it('handles zero income without NaN or Infinity', () => {
    const s = summarize([tx({ date: '2026-10-04', amount: 5000 })]);
    expect(s.income).toBe(0);
    expect(s.net).toBe(-5000);
    expect(s.savingsRate).toBeNull();
  });

  it('handles zero expenses', () => {
    const s = summarize([tx({ type: 'income', date: '2026-10-03', amount: 100000 })]);
    expect(s.expenses).toBe(0);
    expect(s.savingsRate).toBe(100);
  });

  it('handles an empty period', () => {
    const s = summarize([]);
    expect(s).toMatchObject({ income: 0, expenses: 0, net: 0, savingsRate: null, count: 0 });
  });

  it('treats refunds as negative expenses', () => {
    const s = summarize([tx({ date: '2026-10-04', amount: 10000 }), tx({ date: '2026-10-06', amount: 2500, refund: true })]);
    expect(s.expenses).toBe(7500);
  });

  it('never counts transfers as income or expenses, and does not double-count savings', () => {
    const accounts = createEmptyData().accounts;
    const s = summarize(
      [
        tx({ type: 'income', date: '2026-10-03', amount: 300000 }),
        tx({ date: '2026-10-04', amount: 100000 }),
        tx({ type: 'transfer', date: '2026-10-05', amount: 50000, accountId: MAIN, toAccountId: SAV, categoryId: 'savings' }),
      ],
      accounts,
    );
    expect(s.income).toBe(300000);
    expect(s.expenses).toBe(100000);
    expect(s.net).toBe(200000);
    expect(s.movedToSavings).toBe(50000);
  });
});

describe('category breakdown', () => {
  const txs = [
    tx({ date: '2026-10-01', amount: 30000, categoryId: 'food' }),
    tx({ date: '2026-10-02', amount: 15000, categoryId: 'transport' }),
    tx({ date: '2026-10-03', amount: 20000, categoryId: 'shopping' }),
    tx({ date: '2026-10-04', amount: 25000, categoryId: 'travel' }),
    tx({ date: '2026-10-05', amount: 10000, categoryId: 'other' }),
    tx({ type: 'income', date: '2026-10-06', amount: 999999, categoryId: 'salary' }),
  ];

  it('computes share = category / total expenses', () => {
    const b = categoryBreakdown(txs);
    expect(b.total).toBe(100000);
    const pct = Object.fromEntries(b.rows.map((r) => [r.categoryId, r.pct]));
    expect(pct).toEqual({ food: 30, travel: 25, shopping: 20, transport: 15, other: 10 });
    expect(b.rows.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100);
    expect(b.rows[0].categoryId).toBe('food');
  });

  it('is empty (not NaN) when there are no expenses', () => {
    const b = categoryBreakdown([tx({ type: 'income', date: '2026-10-01', amount: 100, categoryId: 'salary' })]);
    expect(b.rows).toEqual([]);
    expect(b.total).toBe(0);
  });

  it('nets refunds against their category and drops categories that end up negative', () => {
    const b = categoryBreakdown([
      tx({ date: '2026-10-01', amount: 10000, categoryId: 'shopping' }),
      tx({ date: '2026-10-02', amount: 4000, categoryId: 'shopping', refund: true }),
      tx({ date: '2026-10-03', amount: 5000, categoryId: 'food' }),
      tx({ date: '2026-10-04', amount: 9000, categoryId: 'travel', refund: true }),
    ]);
    expect(b.rows.find((r) => r.categoryId === 'shopping')?.amount).toBe(6000);
    expect(b.rows.some((r) => r.categoryId === 'travel')).toBe(false);
    expect(b.hasNegative).toBe(true);
    expect(b.rows.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100);
  });

  it('reports refunds left out of the chart so the figures can be reconciled with total expenses', () => {
    const list = [
      tx({ date: '2026-10-01', amount: 5000, categoryId: 'food' }),
      tx({ date: '2026-10-02', amount: 3000, categoryId: 'shopping' }),
      tx({ date: '2026-10-03', amount: 4150, categoryId: 'shopping', refund: true }),
    ];
    const b = categoryBreakdown(list);
    expect(b.total).toBe(5000);
    expect(b.negativeTotal).toBe(-1150);
    expect(b.total + b.negativeTotal).toBe(summarize(list).expenses);
  });

  it('moves spending between categories when a transaction is recategorized', () => {
    const before = [tx({ id: 'a', date: '2026-10-01', amount: 5000, categoryId: 'other', categorySource: 'none' })];
    const after = before.map((t) => ({ ...t, categoryId: 'shopping', categorySource: 'manual' as const }));
    expect(categoryBreakdown(before).rows[0].categoryId).toBe('other');
    expect(categoryBreakdown(after).rows[0].categoryId).toBe('shopping');
  });
});

describe('balances', () => {
  const accounts = [
    { id: MAIN, name: 'Main', kind: 'spending' as const, openingBalance: 100000 },
    { id: SAV, name: 'Savings', kind: 'savings' as const, openingBalance: 500000 },
  ];

  it('moves money between accounts without changing the total', () => {
    const before = balanceSummary(accounts, []);
    const after = balanceSummary(accounts, [
      tx({ type: 'transfer', date: '2026-10-05', amount: 40000, accountId: MAIN, toAccountId: SAV, categoryId: 'savings' }),
    ]);
    expect(before.total).toBe(600000);
    expect(after.total).toBe(600000);
    expect(after.spending).toBe(60000);
    expect(after.savings).toBe(540000);
  });

  it('applies income, expenses, and refunds', () => {
    const b = balanceSummary(accounts, [
      tx({ type: 'income', date: '2026-10-01', amount: 200000 }),
      tx({ date: '2026-10-02', amount: 50000 }),
      tx({ date: '2026-10-03', amount: 5000, refund: true }),
    ]);
    expect(b.spending).toBe(100000 + 200000 - 50000 + 5000);
  });

  it('reflects deletions (removed transactions leave no trace)', () => {
    const t1 = tx({ date: '2026-10-02', amount: 50000 });
    expect(balanceSummary(accounts, [t1]).spending).toBe(50000);
    expect(balanceSummary(accounts, []).spending).toBe(100000);
  });
});

describe('budgets', () => {
  it('computes used percentage and state with 80% and 100% thresholds', () => {
    expect(budgetStatus(5000, 40000).state).toBe('ok');
    expect(budgetStatus(32000, 40000).state).toBe('near');
    expect(budgetStatus(40000, 40000).state).toBe('near');
    expect(budgetStatus(40001, 40000).state).toBe('over');
    expect(budgetStatus(5000, 0).state).toBe('none');
    expect(budgetStatus(5000, 0).usedPct).toBeNull();
    expect(budgetStatus(30000, 40000).remaining).toBe(10000);
    expect(budgetStatus(50000, 40000).remaining).toBe(-10000);
  });

  it('summarizes per category and separates unbudgeted spending', () => {
    const s = budgetSummary(
      [{ categoryId: 'food', amount: 40000 }],
      [
        tx({ date: '2026-10-02', amount: 10000, categoryId: 'food' }),
        tx({ date: '2026-10-03', amount: 7000, categoryId: 'shopping' }),
        tx({ date: '2026-09-03', amount: 99999, categoryId: 'food' }),
      ],
      '2026-10',
    );
    expect(s.totalBudget).toBe(40000);
    expect(s.budgetedSpent).toBe(10000);
    expect(s.unbudgetedSpent).toBe(7000);
    expect(s.overall.usedPct).toBe(25);
  });
});

describe('goals', () => {
  const accounts = createEmptyData().accounts;
  const goal: Goal = { id: 'g1', name: 'Fund', target: 200000, startingAmount: 100000, icon: '🎯', color: '#fff', startDate: '2026-01-01' };

  it('shows 60% and the remaining amount for $1,200 of $2,000', () => {
    const p = goalProgress({ ...goal, startingAmount: 0 }, 120000, '2026-10-15');
    expect(p.pct).toBe(60);
    expect(p.remaining).toBe(80000);
    expect(p.barPct).toBe(60);
  });

  it('adds transfers tagged to the goal and manual allocations, but not other transfers', () => {
    const txs = [
      tx({ type: 'transfer', date: '2026-02-01', amount: 20000, accountId: MAIN, toAccountId: SAV, goalId: 'g1', categoryId: 'savings' }),
      tx({ type: 'transfer', date: '2026-03-01', amount: 99999, accountId: MAIN, toAccountId: SAV, goalId: 'other', categoryId: 'savings' }),
      tx({ type: 'transfer', date: '2026-04-01', amount: 5000, accountId: SAV, toAccountId: MAIN, goalId: 'g1', categoryId: 'savings' }),
    ];
    const entries = [{ id: 'e1', goalId: 'g1', amount: 10000, date: '2026-05-01' }, { id: 'e2', goalId: 'g1', amount: -2500, date: '2026-06-01' }];
    expect(goalSaved(goal, entries, txs, accounts)).toBe(100000 + 20000 - 5000 + 10000 - 2500);
  });

  it('never divides by a zero target and caps the bar at 100%', () => {
    expect(goalProgress({ ...goal, target: 0 }, 5000, '2026-10-15').pct).toBeNull();
    const over = goalProgress(goal, 250000, '2026-10-15');
    expect(over.barPct).toBe(100);
    expect(over.status).toBe('complete');
    expect(over.remaining).toBe(0);
  });

  it('judges pace against the target date', () => {
    const g: Goal = { ...goal, startingAmount: 0, startDate: '2026-01-01', targetDate: '2027-01-01', target: 120000 };
    expect(goalProgress(g, 90000, '2026-07-01').status).toBe('on-track');
    expect(goalProgress(g, 10000, '2026-07-01').status).toBe('behind');
    expect(goalProgress(g, 10000, '2027-02-01').status).toBe('overdue');
    expect(goalProgress({ ...g, targetDate: undefined }, 10000, '2026-07-01').status).toBe('no-date');
  });

  it('detects milestone crossings', () => {
    expect(crossedMilestone(20, 30)).toBe(25);
    expect(crossedMilestone(10, 60)).toBe(50);
    expect(crossedMilestone(50, 60)).toBeNull();
    expect(crossedMilestone(90, 100)).toBe(100);
    expect(crossedMilestone(null, null)).toBeNull();
  });
});

describe('savings overview keeps three figures distinct and consistent', () => {
  it('separates cash flow, money held in savings, and money allocated to goals', () => {
    const data = dataWith(
      [
        tx({ type: 'income', date: '2026-10-03', amount: 400000 }),
        tx({ date: '2026-10-04', amount: 100000 }),
        tx({ type: 'transfer', date: '2026-10-05', amount: 50000, accountId: MAIN, toAccountId: SAV, goalId: 'g1', categoryId: 'savings' }),
      ],
      {
        accounts: [
          { id: MAIN, name: 'Main', kind: 'spending', openingBalance: 0 },
          { id: SAV, name: 'Savings', kind: 'savings', openingBalance: 100000 },
        ],
        goals: [{ id: 'g1', name: 'G', target: 500000, startingAmount: 60000, icon: '🎯', color: '#fff', startDate: '2026-01-01' }],
      },
    );
    const o = savingsOverview(data, '2026-10');
    expect(o.netCashFlow).toBe(300000); // income - expenses; the transfer is not an expense
    expect(o.heldInSavings).toBe(150000); // opening + transfer
    expect(o.allocatedToGoals).toBe(110000); // starting + transfer
    expect(o.unallocated).toBe(40000);
  });
});

describe('savings target', () => {
  it('reports unset, met, on track, behind', () => {
    expect(savingsTargetStatus(0, 0, '2026-10', '2026-10-15').status).toBe('unset');
    expect(savingsTargetStatus(100000, 100000, '2026-10', '2026-10-15').status).toBe('met');
    expect(savingsTargetStatus(60000, 100000, '2026-10', '2026-10-15').status).toBe('on-track');
    expect(savingsTargetStatus(10000, 100000, '2026-10', '2026-10-15').status).toBe('behind');
    expect(savingsTargetStatus(10000, 100000, '2026-09', '2026-10-15').status).toBe('behind');
  });
});

describe('comparison and trends', () => {
  it('compares an in-progress month with the same point last month', () => {
    const c = comparisonFor('2026-10', '2026-10-15');
    expect(c.partial).toBe(true);
    expect(c.current).toEqual({ from: '2026-10-01', to: '2026-10-15' });
    expect(c.previous).toEqual({ from: '2026-09-01', to: '2026-09-15' });
    const full = comparisonFor('2026-09', '2026-10-15');
    expect(full.partial).toBe(false);
    expect(full.previous).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('flags increases, decreases, and new categories', () => {
    const txs = [
      tx({ date: '2026-08-10', amount: 10000, categoryId: 'food' }),
      tx({ date: '2026-09-10', amount: 10000, categoryId: 'food' }),
      tx({ date: '2026-09-11', amount: 10000, categoryId: 'shopping' }),
      tx({ date: '2026-10-10', amount: 15000, categoryId: 'food' }),
      tx({ date: '2026-10-11', amount: 4000, categoryId: 'shopping' }),
      tx({ date: '2026-10-12', amount: 2000, categoryId: 'travel' }),
    ];
    const t = Object.fromEntries(categoryTrends(txs, '2026-10', '2026-10-31').map((x) => [x.categoryId, x]));
    expect(t.food.direction).toBe('up');
    expect(t.food.pct).toBe(50);
    expect(t.shopping.direction).toBe('down');
    expect(t.travel.direction).toBe('new');
    expect(t.travel.pct).toBeNull();
  });
});

describe('recurring detection and projection', () => {
  const rent = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((m) => tx({ date: `${m}-01`, amount: 140000, description: 'Rent', categoryId: 'housing' }));
  const coffee = Array.from({ length: 12 }, (_, i) => tx({ date: `2026-0${(i % 4) + 6}-${String(i + 1).padStart(2, '0')}`, amount: 550, description: 'Coffee' }));

  it('finds bills but not frequent small purchases', () => {
    const groups = detectRecurring([...rent, ...coffee]);
    expect(groups.map((g) => g.key)).toEqual(['rent']);
    expect(groups[0].typicalAmount).toBe(140000);
  });

  it('does not mistake an occasional meal on random days for a bill', () => {
    const meals = [['2026-05-03', 600], ['2026-06-19', 580], ['2026-07-11', 610], ['2026-08-27', 590], ['2026-09-08', 600]].map(([date, amount]) =>
      tx({ date: date as string, amount: amount as number, description: 'Toast Box' }),
    );
    expect(detectRecurring([...rent, ...meals]).map((g) => g.key)).toEqual(['rent']);
  });

  it('still finds a bill whose day drifts a little (weekends, holidays)', () => {
    const phone = [['2026-06-12', 3490], ['2026-07-13', 3490], ['2026-08-11', 3490], ['2026-09-12', 3490]].map(([date, amount]) =>
      tx({ date: date as string, amount: amount as number, description: 'Singtel Mobile' }),
    );
    expect(detectRecurring(phone).map((g) => g.key)).toEqual(['singtel mobile']);
  });

  it('does not let a front-loaded bill inflate the month-end estimate', () => {
    const everyday = Array.from({ length: 14 }, (_, i) => tx({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, amount: 2000, description: `Meal ${i}` }));
    const txs = [...rent, ...everyday];
    const p = projectMonthEnd(txs, '2026-10', '2026-10-14', detectRecurring(txs));
    expect(p.kind).toBe('estimate');
    // rent 1400 + 14 days * 20 = 1680 so far; +17 days * 20 = 340 more
    expect(p.amount).toBe(140000 + 28000 + 17 * 2000);
    expect(p.amount).toBeLessThan(140000 * 31 / 14);
  });

  it('only labels a projection when there is enough data', () => {
    const p = projectMonthEnd([tx({ date: '2026-10-01', amount: 1000 })], '2026-10', '2026-10-02', []);
    expect(p.kind).toBe('too-early');
    expect(projectMonthEnd([tx({ date: '2026-09-01', amount: 1000 })], '2026-09', '2026-10-02', []).kind).toBe('final');
    expect(projectMonthEnd([], '2026-11', '2026-10-02', []).kind).toBe('future');
  });

  it('flags unusually expensive days without flagging rent day', () => {
    const month = [
      ...rent.slice(-1),
      ...Array.from({ length: 10 }, (_, i) => tx({ date: `2026-10-${String(i + 2).padStart(2, '0')}`, amount: 1500, description: `Lunch ${i}` })),
      tx({ date: '2026-10-20', amount: 30000, description: 'Big shop' }),
    ];
    const days = unusualDays(month, detectRecurring([...rent, ...month]));
    expect([...days]).toEqual(['2026-10-20']);
  });
});

describe('time series', () => {
  it('buckets by month with running cash flow and savings balance', () => {
    const data = dataWith(
      [
        tx({ type: 'income', date: '2026-08-03', amount: 100000 }),
        tx({ date: '2026-08-10', amount: 40000 }),
        tx({ type: 'income', date: '2026-09-03', amount: 100000 }),
        tx({ type: 'transfer', date: '2026-09-05', amount: 30000, accountId: MAIN, toAccountId: SAV, categoryId: 'savings' }),
        tx({ date: '2026-09-10', amount: 20000 }),
      ],
      {
        accounts: [
          { id: MAIN, name: 'Main', kind: 'spending', openingBalance: 0 },
          { id: SAV, name: 'Savings', kind: 'savings', openingBalance: 5000 },
        ],
      },
    );
    const b = buildBuckets(data, 'month', 3, '2026-10-15');
    expect(b.map((x) => x.key)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(b[0]).toMatchObject({ income: 100000, expenses: 40000, net: 60000, cumulativeNet: 60000, savingsBalance: 5000 });
    expect(b[1]).toMatchObject({ income: 100000, expenses: 20000, net: 80000, cumulativeNet: 140000, savingsBalance: 35000 });
    expect(b[2]).toMatchObject({ income: 0, expenses: 0, cumulativeNet: 140000 });
  });

  it('can trim empty periods before the first transaction', () => {
    const data = dataWith([tx({ date: '2026-08-10', amount: 1000 })]);
    expect(buildBuckets(data, 'month', 12, '2026-10-15').length).toBe(12);
    expect(buildBuckets(data, 'month', 12, '2026-10-15', 1, { minKeep: 2 }).map((b) => b.key)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(buildBuckets(data, 'month', 12, '2026-10-15', 1, { minKeep: 6 })).toHaveLength(6);
  });

  it('supports weekly and yearly views', () => {
    const data = dataWith([tx({ date: '2026-10-13', amount: 1000 }), tx({ date: '2025-03-01', amount: 500 })]);
    const w = buildBuckets(data, 'week', 4, '2026-10-15', 1);
    expect(w).toHaveLength(4);
    expect(w[3].from).toBe('2026-10-12');
    expect(w[3].expenses).toBe(1000);
    const y = buildBuckets(data, 'year', 5, '2026-10-15');
    expect(y.map((x) => x.key)).toEqual(['2025', '2026']);
    expect(y[0].expenses).toBe(500);
  });
});

describe('insights are computed from data', () => {
  it('produces no fabricated comparisons without history', () => {
    const data = dataWith([tx({ date: '2026-10-05', amount: 5000 })]);
    const texts = generateInsights(data, '2026-10', '2026-10-15').map((i) => i.text).join('\n');
    expect(texts).not.toMatch(/less than|more than/);
    expect(texts).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('reports spending changes, top category, and uncategorized counts', () => {
    const data = dataWith([
      tx({ type: 'income', date: '2026-10-03', amount: 400000, categoryId: 'salary' }),
      tx({ date: '2026-09-05', amount: 100000, categoryId: 'food' }),
      tx({ date: '2026-10-05', amount: 88000, categoryId: 'food' }),
      tx({ date: '2026-10-06', amount: 3000, categoryId: 'other', categorySource: 'none' }),
    ]);
    const texts = generateInsights(data, '2026-10', '2026-11-05').map((i) => i.text);
    expect(texts.some((t) => /spent 9% less than last month/.test(t))).toBe(true);
    expect(texts.some((t) => /Food & Dining is your biggest spending category/.test(t))).toBe(true);
    expect(texts.some((t) => /1 uncategorized transaction\./.test(t))).toBe(true);
    expect(texts.some((t) => /savings rate is 77%/.test(t))).toBe(true);
  });

  it('handles an empty month', () => {
    const texts = generateInsights(dataWith([]), '2026-10', '2026-10-15').map((i) => i.text);
    expect(texts[0]).toMatch(/Nothing recorded/);
  });
});

describe('month summary respects month boundaries', () => {
  it('includes first and last days only in their own month', () => {
    const txs = [
      tx({ date: '2026-09-30', amount: 100 }),
      tx({ date: '2026-10-01', amount: 200 }),
      tx({ date: '2026-10-31', amount: 400 }),
      tx({ date: '2026-11-01', amount: 800 }),
    ];
    expect(summarizeMonth(txs, '2026-10').expenses).toBe(600);
  });
});
