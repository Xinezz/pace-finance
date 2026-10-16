import { describe, expect, it } from 'vitest';
import { balanceSummary, categoryBreakdown, goalProgress, goalSaved, savingsOverview, summarizeMonth } from './calc';
import { needsCategory } from './categorize';
import { createDemoData } from './demo';
import { generateInsights, generateNotices } from './insights';
import { currentMonthKey } from './dates';

describe('demo data', () => {
  const today = '2026-10-15';
  const data = createDemoData(today);

  it('is flagged as demo and covers several months', () => {
    expect(data.meta.mode).toBe('demo');
    expect(data.transactions.length).toBeGreaterThan(300);
    expect(data.transactions.every((t) => t.isDemo)).toBe(true);
    expect(new Set(data.transactions.map((t) => t.date.slice(0, 7))).size).toBeGreaterThanOrEqual(7);
    expect(data.transactions.every((t) => t.date <= today)).toBe(true);
  });

  it('contains items that need the user (uncategorized, refunds, transfers)', () => {
    expect(data.transactions.filter(needsCategory).length).toBeGreaterThanOrEqual(4);
    expect(data.transactions.some((t) => t.refund)).toBe(true);
    expect(data.transactions.some((t) => t.type === 'transfer')).toBe(true);
  });

  it('keeps goal allocations consistent with money held in savings', () => {
    const o = savingsOverview(data, '2026-10', today);
    expect(o.heldInSavings).toBeGreaterThan(0);
    expect(o.unallocated).toBeGreaterThanOrEqual(0);
    const sum = data.goals.reduce((s, g) => s + goalSaved(g, data.goalEntries, data.transactions, data.accounts), 0);
    expect(sum).toBe(o.allocatedToGoals);
    for (const g of data.goals) {
      const p = goalProgress(g, goalSaved(g, data.goalEntries, data.transactions, data.accounts), today);
      expect(Number.isFinite(p.pct ?? 0)).toBe(true);
    }
  });

  it('has a healthy current month and no negative balances', () => {
    const s = summarizeMonth(data.transactions, '2026-10', data.accounts);
    expect(s.income).toBeGreaterThan(0);
    expect(s.expenses).toBeGreaterThan(0);
    expect(balanceSummary(data.accounts, data.transactions).spending).toBeGreaterThan(0);
    expect(categoryBreakdown(data.transactions.filter((t) => t.date.startsWith('2026-10'))).rows.length).toBeGreaterThan(3);
  });

  it('produces insights and notices without NaN', () => {
    const texts = [...generateInsights(data, '2026-10', today).map((i) => i.text), ...generateNotices(data, today).map((n) => n.body)];
    expect(texts.length).toBeGreaterThan(3);
    for (const t of texts) expect(t).not.toMatch(/NaN|Infinity|undefined|null/);
  });

  it('is deterministic for a given day', () => {
    const again = createDemoData(today);
    expect(again.transactions.map((t) => [t.date, t.description, t.amount])).toEqual(data.transactions.map((t) => [t.date, t.description, t.amount]));
  });

  it('works for the real current date too', () => {
    const live = createDemoData();
    expect(live.transactions.some((t) => t.date.startsWith(currentMonthKey()))).toBe(true);
  });
});
