import { describe, expect, it } from 'vitest';
import { createDemoData } from './demo';
import { dataWith, tx } from './testUtils';
import { annualReport, monthOverMonth, monthlyReport, reportToMarkdown, savingsReport } from './report';

const data = dataWith([
  tx({ type: 'income', date: '2026-08-03', amount: 400000, categoryId: 'salary' }),
  tx({ date: '2026-08-10', amount: 100000, categoryId: 'food' }),
  tx({ type: 'income', date: '2026-09-03', amount: 400000, categoryId: 'salary' }),
  tx({ date: '2026-09-10', amount: 150000, categoryId: 'food' }),
  tx({ date: '2026-09-12', amount: 50000, categoryId: 'shopping' }),
]);

describe('reports', () => {
  it('builds a monthly report with comparisons against last month', () => {
    const r = monthlyReport(data, '2026-09');
    expect(r.summary).toMatchObject({ income: 400000, expenses: 200000, net: 200000 });
    expect(r.previous.expenses).toBe(100000);
    expect(r.expenseDelta.pct).toBe(100);
    expect(r.categories[0]).toMatchObject({ categoryId: 'food', amount: 150000, previousAmount: 100000 });
    expect(r.categories[0].pct).toBe(75);
  });

  it('builds an annual report that adds up', () => {
    const a = annualReport(data, 2026);
    expect(a.rows).toHaveLength(12);
    expect(a.total.income).toBe(800000);
    expect(a.total.expenses).toBe(300000);
    expect(a.rows.reduce((s, r) => s + r.net, 0)).toBe(a.total.net);
    expect(a.bestMonth?.month).toBe('2026-08');
    expect(a.priciestMonth?.month).toBe('2026-09');
    expect(annualReport(data, 2020).bestMonth).toBeNull();
  });

  it('compares month over month without dividing by zero', () => {
    const rows = monthOverMonth(data, '2026-09', 3);
    expect(rows.map((r) => r.month)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(rows[0].expenseChangePct).toBeNull(); // nothing in June to compare with
    expect(rows[2].expenseChangePct).toBe(100);
  });

  it('reports savings target adherence only when a target is set', () => {
    expect(savingsReport(data, 2026, '2026-10-15').months.every((m) => m.metTarget === null)).toBe(true);
    const withTarget = { ...data, settings: { ...data.settings, monthlySavingsTarget: 250000 } };
    expect(savingsReport(withTarget, 2026, '2026-10-15').months.map((m) => m.metTarget)).toEqual([true, false]);
  });

  it('writes a readable markdown summary with no NaN', () => {
    const md = reportToMarkdown(createDemoData('2026-10-15'), '2026-10', '2026-10-15');
    expect(md).toMatch(/^# Pace summary/);
    expect(md).toContain('## Spending by category');
    expect(md).toContain('## Savings goals');
    expect(md).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('handles an empty month gracefully', () => {
    const md = reportToMarkdown(dataWith([]), '2026-10', '2026-10-15');
    expect(md).toContain('No spending recorded.');
    expect(md).not.toMatch(/NaN|Infinity/);
  });
});
