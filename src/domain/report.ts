/** Report calculations. Pure functions built on domain/calc so reports can never disagree with the dashboard. */
import {
  budgetSummary,
  categoryBreakdown,
  delta,
  filterPeriod,
  goalProgress,
  goalSaved,
  summarize,
  summarizeMonth,
  type BudgetSummary,
  type CategoryRow,
  type Delta,
  type GoalProgress,
  type PeriodSummary,
} from './calc';
import { needsCategory } from './categorize';
import { addMonths, formatMonthLabel, monthRange, type MonthKey } from './dates';
import { formatMoney, formatPct } from './money';
import type { AppData, Goal, Transaction } from './types';

export interface MonthlyReport {
  month: MonthKey;
  summary: PeriodSummary;
  previous: PeriodSummary;
  incomeDelta: Delta;
  expenseDelta: Delta;
  categories: (CategoryRow & { previousAmount: number })[];
  budgets: BudgetSummary;
  biggest: Transaction[];
  uncategorized: number;
}

export function monthlyReport(data: AppData, month: MonthKey): MonthlyReport {
  const { from, to } = monthRange(month);
  const txs = filterPeriod(data.transactions, from, to);
  const summary = summarize(txs, data.accounts);
  const prevKey = addMonths(month, -1);
  const prevTxs = filterPeriod(data.transactions, monthRange(prevKey).from, monthRange(prevKey).to);
  const previous = summarize(prevTxs, data.accounts);
  const prevBreak = new Map(categoryBreakdown(prevTxs).rows.map((r) => [r.categoryId, r.amount]));
  const bd = categoryBreakdown(txs);
  return {
    month,
    summary,
    previous,
    incomeDelta: delta(summary.income, previous.income),
    expenseDelta: delta(summary.expenses, previous.expenses),
    categories: bd.rows.map((r) => ({ ...r, previousAmount: prevBreak.get(r.categoryId) ?? 0 })),
    budgets: budgetSummary(data.budgets, data.transactions, month),
    biggest: txs.filter((t) => t.type === 'expense' && !t.refund).sort((a, b) => b.amount - a.amount).slice(0, 5),
    uncategorized: txs.filter(needsCategory).length,
  };
}

export interface AnnualRow {
  month: MonthKey;
  income: number;
  expenses: number;
  net: number;
  savingsRate: number | null;
  hasData: boolean;
}

export interface AnnualReport {
  year: number;
  rows: AnnualRow[];
  total: PeriodSummary;
  bestMonth: AnnualRow | null;
  priciestMonth: AnnualRow | null;
  categories: CategoryRow[];
}

export function annualReport(data: AppData, year: number): AnnualReport {
  const rows: AnnualRow[] = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    const txs = filterPeriod(data.transactions, monthRange(month).from, monthRange(month).to);
    const s = summarize(txs);
    return { month, income: s.income, expenses: s.expenses, net: s.net, savingsRate: s.savingsRate, hasData: txs.length > 0 };
  });
  const yearTxs = filterPeriod(data.transactions, `${year}-01-01`, `${year}-12-31`);
  const withData = rows.filter((r) => r.hasData);
  return {
    year,
    rows,
    total: summarize(yearTxs, data.accounts),
    bestMonth: withData.length ? withData.reduce((b, r) => (r.net > b.net ? r : b)) : null,
    priciestMonth: withData.length ? withData.reduce((b, r) => (r.expenses > b.expenses ? r : b)) : null,
    categories: categoryBreakdown(yearTxs).rows,
  };
}

export interface MomRow {
  month: MonthKey;
  income: number;
  expenses: number;
  net: number;
  savingsRate: number | null;
  expenseChangePct: number | null;
  incomeChangePct: number | null;
}

/** Month-over-month comparison for the `count` months ending at `endMonth`. */
export function monthOverMonth(data: AppData, endMonth: MonthKey, count: number): MomRow[] {
  const keys = Array.from({ length: count + 1 }, (_, i) => addMonths(endMonth, -(count - i)));
  const sums = keys.map((k) => summarizeMonth(data.transactions, k));
  return keys.slice(1).map((month, i) => {
    const cur = sums[i + 1];
    const prev = sums[i];
    return {
      month,
      income: cur.income,
      expenses: cur.expenses,
      net: cur.net,
      savingsRate: cur.savingsRate,
      expenseChangePct: delta(cur.expenses, prev.expenses).pct,
      incomeChangePct: delta(cur.income, prev.income).pct,
    };
  });
}

export interface SavingsReport {
  goals: { goal: Goal; progress: GoalProgress }[];
  months: { month: MonthKey; net: number; metTarget: boolean | null }[];
}

export function savingsReport(data: AppData, year: number, today: string): SavingsReport {
  const goals = data.goals.map((goal) => ({ goal, progress: goalProgress(goal, goalSaved(goal, data.goalEntries, data.transactions, data.accounts), today) }));
  const target = data.settings.monthlySavingsTarget;
  const months = annualReport(data, year).rows.filter((r) => r.hasData).map((r) => ({ month: r.month, net: r.net, metTarget: target > 0 ? r.net >= target : null }));
  return { goals, months };
}

/** A plain-text (Markdown) summary for download. */
export function reportToMarkdown(data: AppData, month: MonthKey, today: string): string {
  const cur = data.settings.currency;
  const money = (n: number) => formatMoney(n, cur);
  const r = monthlyReport(data, month);
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const lines: string[] = [];
  lines.push(`# Pace summary - ${formatMonthLabel(month)}`, '');
  lines.push(`Generated ${today}. Currency: ${cur}.`, '');
  lines.push('## Overview', '');
  lines.push(`- Income: ${money(r.summary.income)}`);
  lines.push(`- Expenses: ${money(r.summary.expenses)}`);
  lines.push(`- Net cash flow: ${money(r.summary.net)}`);
  lines.push(`- Savings rate: ${formatPct(r.summary.savingsRate)}`);
  if (r.previous.income > 0 || r.previous.expenses > 0) {
    lines.push(`- Previous month: income ${money(r.previous.income)}, expenses ${money(r.previous.expenses)}`);
  }
  lines.push('', '## Spending by category', '');
  if (r.categories.length === 0) lines.push('No spending recorded.');
  else {
    lines.push('| Category | Amount | Share |', '| --- | ---: | ---: |');
    for (const c of r.categories) lines.push(`| ${cats.get(c.categoryId)?.name ?? 'Uncategorized'} | ${money(c.amount)} | ${formatPct(c.pct, 1)} |`);
  }
  if (r.budgets.rows.length) {
    lines.push('', '## Budgets', '', '| Category | Budget | Spent | Used |', '| --- | ---: | ---: | ---: |');
    for (const b of r.budgets.rows) lines.push(`| ${cats.get(b.categoryId)?.name ?? ''} | ${money(b.budget)} | ${money(b.spent)} | ${formatPct(b.usedPct)} |`);
  }
  if (data.goals.length) {
    lines.push('', '## Savings goals', '', '| Goal | Saved | Target | Progress |', '| --- | ---: | ---: | ---: |');
    for (const g of data.goals) {
      const p = goalProgress(g, goalSaved(g, data.goalEntries, data.transactions, data.accounts), today);
      lines.push(`| ${g.name} | ${money(p.saved)} | ${money(g.target)} | ${formatPct(p.pct)} |`);
    }
  }
  if (r.uncategorized > 0) lines.push('', `> ${r.uncategorized} transaction${r.uncategorized === 1 ? '' : 's'} in this month still need a category.`);
  return `${lines.join('\n')}\n`;
}
