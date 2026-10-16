/**
 * Data-driven insights and notifications. Every sentence is built from the user's actual numbers
 * and is omitted when the numbers can't support it (no previous month, zero income, etc.).
 */
import {
  budgetSummary,
  categoryBreakdown,
  categoryById,
  categoryTrends,
  comparisonFor,
  delta,
  filterPeriod,
  goalProgress,
  goalSaved,
  savingsTargetStatus,
  summarize,
  summarizeMonth,
} from './calc';
import { needsCategory } from './categorize';
import { formatMonthLabel, monthKeyOf, monthRange, type MonthKey } from './dates';
import { currencyDecimals, formatMoney, formatPct } from './money';
import type { AppData } from './types';

export type InsightTone = 'good' | 'neutral' | 'attention';
export type InsightIcon = 'down' | 'up' | 'piggy' | 'pie' | 'target' | 'tag' | 'wallet' | 'flag' | 'sparkle';

export interface Insight {
  id: string;
  tone: InsightTone;
  icon: InsightIcon;
  text: string;
  /** Lower comes first. */
  priority: number;
  /** In-app route such as '/transactions?needs=1'. */
  link?: { to: string; label: string };
}

export function generateInsights(data: AppData, month: MonthKey, today: string): Insight[] {
  const cur = data.settings.currency;
  const money = (n: number) => formatMoney(Math.abs(n), cur, { trimWhole: true });
  const out: Insight[] = [];
  const catMap = categoryById(data.categories);
  const name = (id: string) => catMap.get(id)?.name ?? 'Uncategorized';

  const cmp = comparisonFor(month, today);
  const { from, to } = monthRange(month);
  const monthTxs = filterPeriod(data.transactions, from, to);
  const sum = summarize(monthTxs, data.accounts);
  const prev = summarize(filterPeriod(data.transactions, cmp.previous.from, cmp.previous.to));
  const curCmp = cmp.partial ? summarize(filterPeriod(data.transactions, cmp.current.from, cmp.current.to)) : sum;
  const monthLabel = formatMonthLabel(month);

  if (monthTxs.length === 0) {
    out.push({ id: 'empty', tone: 'neutral', icon: 'sparkle', priority: 0, text: `Nothing recorded for ${monthLabel} yet. Add a transaction to see your insights here.` });
  }

  // 1. Spending vs previous period
  if (prev.expenses > 0 && curCmp.expenses > 0) {
    const d = delta(curCmp.expenses, prev.expenses);
    if (d.pct !== null) {
      const rounded = Math.round(Math.abs(d.pct));
      if (rounded === 0) {
        out.push({ id: 'spend-flat', tone: 'neutral', icon: 'wallet', priority: 10, text: `Your spending is about the same as ${cmp.previousLabel}.` });
      } else if (d.diff < 0) {
        out.push({ id: 'spend-down', tone: 'good', icon: 'down', priority: 10, text: `You spent ${rounded}% less than ${cmp.previousLabel}.` });
      } else {
        out.push({ id: 'spend-up', tone: 'attention', icon: 'up', priority: 10, text: `You spent ${rounded}% more than ${cmp.previousLabel}.` });
      }
    }
  }

  // 2. Savings rate / cash position
  if (sum.income > 0) {
    if (sum.net >= 0) {
      out.push({ id: 'savings-rate', tone: 'good', icon: 'piggy', priority: 20, text: `Your savings rate is ${formatPct(sum.savingsRate)} this month.` });
    } else {
      out.push({ id: 'overspent', tone: 'attention', icon: 'wallet', priority: 20, text: `Spending is ${money(sum.net)} ahead of recorded income in ${monthLabel}.` });
    }
  } else if (sum.expenses > 0) {
    out.push({ id: 'no-income', tone: 'neutral', icon: 'wallet', priority: 25, text: `No income is recorded for ${monthLabel} yet, so a savings rate can't be worked out.` });
  }

  // 3. Biggest category
  const bd = categoryBreakdown(monthTxs, 'expense');
  if (bd.rows.length > 0) {
    const top = bd.rows[0];
    out.push({ id: 'top-category', tone: 'neutral', icon: 'pie', priority: 30, text: `${name(top.categoryId)} is your biggest spending category (${formatPct(top.pct)} of expenses).` });
    for (const row of bd.rows.slice(1, 3)) {
      out.push({ id: `share-${row.categoryId}`, tone: 'neutral', icon: 'pie', priority: 70, text: `${name(row.categoryId)} accounts for ${formatPct(row.pct)} of your expenses.` });
    }
  }

  // 4. Closest goal
  const goals = data.goals
    .map((g) => ({ g, p: goalProgress(g, goalSaved(g, data.goalEntries, data.transactions, data.accounts), today) }))
    .filter((x) => x.p.pct !== null && x.p.status !== 'complete')
    .sort((a, b) => (b.p.pct ?? 0) - (a.p.pct ?? 0));
  if (goals.length > 0 && (goals[0].p.pct ?? 0) > 0) {
    const { g, p } = goals[0];
    out.push({ id: 'goal', tone: 'good', icon: 'target', priority: 40, text: `You're ${formatPct(p.pct)} of the way toward your "${g.name}" goal.`, link: { to: '/savings', label: 'View goals' } });
  }

  // 5. Money left
  if (sum.income > 0 && sum.net > 0) {
    out.push({ id: 'left', tone: 'good', icon: 'wallet', priority: 35, text: `You have ${money(sum.net)} left from your recorded income after expenses.` });
  }

  // 6. Category movement
  const trends = categoryTrends(data.transactions, month, today).filter((t) => t.previous > 0 && t.current > 0);
  const biggestUp = [...trends].sort((a, b) => b.diff - a.diff)[0];
  const biggestDown = [...trends].sort((a, b) => a.diff - b.diff)[0];
  const minMovement = 5 * 10 ** currencyDecimals(cur); // ignore movements smaller than 5 currency units
  if (biggestUp && biggestUp.diff > minMovement && biggestUp.pct !== null) {
    out.push({
      id: `cat-up-${biggestUp.categoryId}`,
      tone: 'attention',
      icon: 'up',
      priority: 50,
      text: `You spent ${money(biggestUp.diff)} more on ${name(biggestUp.categoryId)} than ${cmp.previousLabel} (up ${Math.round(biggestUp.pct)}%).`,
    });
  }
  if (biggestDown && biggestDown.diff < -minMovement && biggestDown.pct !== null) {
    out.push({
      id: `cat-down-${biggestDown.categoryId}`,
      tone: 'good',
      icon: 'down',
      priority: 55,
      text: `${name(biggestDown.categoryId)} spending is down ${money(biggestDown.diff)} (${Math.round(Math.abs(biggestDown.pct))}%) compared with ${cmp.previousLabel}.`,
    });
  }

  // 7. Budgets
  const bs = budgetSummary(data.budgets, data.transactions, month);
  for (const r of bs.rows.filter((r) => r.state === 'over').slice(0, 2)) {
    out.push({ id: `over-${r.categoryId}`, tone: 'attention', icon: 'flag', priority: 15, text: `${name(r.categoryId)} is ${money(r.remaining)} over its budget.`, link: { to: '/budgets', label: 'Review budgets' } });
  }

  // 8. Uncategorized
  const uncategorized = data.transactions.filter(needsCategory).length;
  if (uncategorized > 0) {
    out.push({
      id: 'uncategorized',
      tone: 'attention',
      icon: 'tag',
      priority: 5,
      text: `You have ${uncategorized} uncategorized transaction${uncategorized === 1 ? '' : 's'}.`,
      link: { to: '/transactions?needs=1', label: 'Categorize' },
    });
  }

  // 9. Savings target
  const target = data.settings.monthlySavingsTarget;
  if (target > 0) {
    const st = savingsTargetStatus(sum.net, target, month, today);
    if (st.status === 'met') out.push({ id: 'target-met', tone: 'good', icon: 'sparkle', priority: 12, text: `You've reached your monthly savings target of ${money(target)}.` });
    else if (st.status === 'behind') out.push({ id: 'target-behind', tone: 'attention', icon: 'target', priority: 22, text: `You're ${money(target - sum.net)} short of your ${money(target)} monthly savings target.` });
  }

  return out.sort((a, b) => a.priority - b.priority);
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export interface Notice {
  id: string;
  tone: InsightTone;
  title: string;
  body: string;
  link?: { to: string; label: string };
}

/** Budget warnings, uncategorized reminders and goal nudges for the current calendar month. */
export function generateNotices(data: AppData, today: string): Notice[] {
  const month = monthKeyOf(today);
  const cur = data.settings.currency;
  const money = (n: number) => formatMoney(Math.abs(n), cur, { trimWhole: true });
  const catMap = categoryById(data.categories);
  const notices: Notice[] = [];

  const bs = budgetSummary(data.budgets, data.transactions, month);
  for (const r of bs.rows) {
    const c = catMap.get(r.categoryId);
    if (!c) continue;
    if (r.state === 'over') {
      notices.push({ id: `budget-over:${month}:${r.categoryId}`, tone: 'attention', title: `${c.icon} ${c.name} is over budget`, body: `You've spent ${money(r.spent)} of ${money(r.budget)} - ${money(r.remaining)} over.`, link: { to: '/budgets', label: 'Open budgets' } });
    } else if (r.state === 'near') {
      notices.push({ id: `budget-near:${month}:${r.categoryId}`, tone: 'neutral', title: `${c.icon} ${c.name} is near its limit`, body: `${formatPct(r.usedPct)} used - ${money(r.remaining)} left this month.`, link: { to: '/budgets', label: 'Open budgets' } });
    }
  }

  const uncategorized = data.transactions.filter(needsCategory).length;
  if (uncategorized > 0) {
    notices.push({ id: `uncategorized:${uncategorized}`, tone: 'attention', title: `${uncategorized} transaction${uncategorized === 1 ? '' : 's'} need${uncategorized === 1 ? 's' : ''} a category`, body: 'Pick a category so your charts and budgets stay accurate.', link: { to: '/transactions?needs=1', label: 'Categorize now' } });
  }

  for (const g of data.goals) {
    const p = goalProgress(g, goalSaved(g, data.goalEntries, data.transactions, data.accounts), today);
    if (p.status === 'overdue') {
      notices.push({ id: `goal-overdue:${g.id}`, tone: 'attention', title: `${g.icon} "${g.name}" passed its target date`, body: `${money(p.remaining)} still to go. You can move the date on the Savings page.`, link: { to: '/savings', label: 'Open savings' } });
    }
  }

  const target = data.settings.monthlySavingsTarget;
  const day = Number(today.slice(8, 10));
  const monthSummary = summarizeMonth(data.transactions, month, data.accounts);
  if (target > 0 && day >= 15 && monthSummary.count > 0) {
    const net = monthSummary.net;
    const st = savingsTargetStatus(net, target, month, today);
    if (st.status === 'behind') {
      notices.push({ id: `target-behind:${month}`, tone: 'neutral', title: 'Monthly savings target', body: `${money(target - net)} to go to reach ${money(target)} this month.`, link: { to: '/savings', label: 'See savings' } });
    }
  }

  const dismissed = new Set(data.settings.dismissedNotifications);
  return notices.filter((n) => !dismissed.has(n.id));
}
