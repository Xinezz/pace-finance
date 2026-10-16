/**
 * Centralised financial calculations. Every number shown anywhere in the app comes from here,
 * so the rules below hold consistently across the dashboard, analytics, budgets, and reports:
 *
 *   total income      = sum of income transactions in the period
 *   total expenses    = sum of expense transactions in the period, minus refunds
 *   net cash flow     = income - expenses
 *   savings rate      = net / income * 100         (only when income > 0)
 *   category share    = category / total * 100     (only when total > 0)
 *   budget used       = spent / budget * 100       (only when budget > 0)
 *   goal completion   = saved / target * 100       (only when target > 0)
 *
 * Transfers between the user's own accounts are never income or expenses. A savings transfer
 * moves money between accounts, so it changes balances but not cash flow.
 */
import { addDays, addMonths, daysInMonth, diffDays, formatDate, formatMonthName, monthDiff, monthKeyOf, monthRange, weekStartOf, yearOf, type MonthKey } from './dates';
import { normalizeDescription } from './categorize';
import { safePct } from './money';
import type { Account, AppData, Budget, Category, Goal, GoalEntry, Transaction } from './types';

/* ------------------------------------------------------------------ */
/* Per-transaction effects                                             */
/* ------------------------------------------------------------------ */

/** Effect on total expenses: positive for spending, negative for a refund, zero otherwise. */
export function expenseEffect(t: Transaction): number {
  if (t.type !== 'expense') return 0;
  return t.refund ? -t.amount : t.amount;
}

export function incomeEffect(t: Transaction): number {
  return t.type === 'income' ? t.amount : 0;
}

export function inPeriod(t: Transaction, from: string, to: string): boolean {
  return t.date >= from && t.date <= to;
}

export function filterPeriod(txs: Transaction[], from: string, to: string): Transaction[] {
  return txs.filter((t) => inPeriod(t, from, to));
}

export function accountMap(accounts: Account[]): Map<string, Account> {
  return new Map(accounts.map((a) => [a.id, a]));
}

/**
 * How a transfer changes the money held in savings accounts: + when moving from a non-savings
 * account into a savings account, - when moving back out, 0 otherwise (e.g. savings to savings).
 */
export function savingsTransferEffect(t: Transaction, accounts: Map<string, Account>): number {
  if (t.type !== 'transfer' || !t.toAccountId) return 0;
  const from = accounts.get(t.accountId);
  const to = accounts.get(t.toAccountId);
  if (!from || !to) return 0;
  const fromSavings = from.kind === 'savings';
  const toSavings = to.kind === 'savings';
  if (!fromSavings && toSavings) return t.amount;
  if (fromSavings && !toSavings) return -t.amount;
  return 0;
}

/* ------------------------------------------------------------------ */
/* Period summary                                                      */
/* ------------------------------------------------------------------ */

export interface PeriodSummary {
  income: number;
  expenses: number;
  /** Net cash flow: income - expenses. */
  net: number;
  /** Percentage of income left after expenses; null when income is zero. */
  savingsRate: number | null;
  /** Net money moved into savings accounts by transfers (does not affect `net`). */
  movedToSavings: number;
  count: number;
}

export function summarize(txs: Transaction[], accounts: Account[] = []): PeriodSummary {
  const accMap = accountMap(accounts);
  let income = 0;
  let expenses = 0;
  let moved = 0;
  for (const t of txs) {
    income += incomeEffect(t);
    expenses += expenseEffect(t);
    moved += savingsTransferEffect(t, accMap);
  }
  const net = income - expenses;
  return { income, expenses, net, savingsRate: safePct(net, income), movedToSavings: moved, count: txs.length };
}

export function summarizePeriod(txs: Transaction[], from: string, to: string, accounts: Account[] = []): PeriodSummary {
  return summarize(filterPeriod(txs, from, to), accounts);
}

export function summarizeMonth(txs: Transaction[], key: MonthKey, accounts: Account[] = []): PeriodSummary {
  const { from, to } = monthRange(key);
  return summarizePeriod(txs, from, to, accounts);
}

/* ------------------------------------------------------------------ */
/* Comparison periods                                                  */
/* ------------------------------------------------------------------ */

export interface Comparison {
  current: { from: string; to: string };
  previous: { from: string; to: string };
  /** True when the selected month is still in progress, so we compare the same point last month. */
  partial: boolean;
  previousLabel: string;
}

/**
 * The range to compare against. For a month still in progress we compare month-to-date with the
 * same number of days of the previous month, so day 10 isn't judged against a whole month.
 */
export function comparisonFor(month: MonthKey, today: string): Comparison {
  const prevKey = addMonths(month, -1);
  const prevRange = monthRange(prevKey);
  const curRange = monthRange(month);
  const todayKey = monthKeyOf(today);
  if (month === todayKey) {
    const day = Number(today.slice(8, 10));
    const prevDay = Math.min(day, daysInMonth(prevKey));
    return {
      current: { from: curRange.from, to: today },
      previous: { from: prevRange.from, to: `${prevKey}-${String(prevDay).padStart(2, '0')}` },
      partial: true,
      previousLabel: `this point last month`,
    };
  }
  return { current: curRange, previous: prevRange, partial: false, previousLabel: 'last month' };
}

export interface Delta {
  current: number;
  previous: number;
  diff: number;
  /** null when previous is zero (a percentage change would be meaningless). */
  pct: number | null;
}

export function delta(current: number, previous: number): Delta {
  const diff = current - previous;
  return { current, previous, diff, pct: previous > 0 ? (diff / previous) * 100 : null };
}

/* ------------------------------------------------------------------ */
/* Category breakdown                                                  */
/* ------------------------------------------------------------------ */

export interface CategoryRow {
  categoryId: string;
  amount: number;
  /** Share of the breakdown total, 0-100. */
  pct: number;
  count: number;
}

export interface Breakdown {
  rows: CategoryRow[];
  /** Sum of rows (categories with a positive net). Equals total expenses unless refunds leave a category negative. */
  total: number;
  /** True when a category's refunds exceed its spending in this period and was left out. */
  hasNegative: boolean;
  /** Sum of those left-out categories (zero or negative). total + negativeTotal = total expenses. */
  negativeTotal: number;
}

export function categoryBreakdown(txs: Transaction[], kind: 'expense' | 'income' = 'expense'): Breakdown {
  const sums = new Map<string, { amount: number; count: number }>();
  for (const t of txs) {
    const eff = kind === 'expense' ? expenseEffect(t) : incomeEffect(t);
    if (t.type !== kind) continue;
    const cur = sums.get(t.categoryId) ?? { amount: 0, count: 0 };
    cur.amount += eff;
    cur.count += 1;
    sums.set(t.categoryId, cur);
  }
  let hasNegative = false;
  let negativeTotal = 0;
  const positive: { categoryId: string; amount: number; count: number }[] = [];
  for (const [categoryId, v] of sums) {
    if (v.amount > 0) positive.push({ categoryId, ...v });
    else if (v.amount < 0) {
      hasNegative = true;
      negativeTotal += v.amount;
    }
  }
  const total = positive.reduce((s, r) => s + r.amount, 0);
  const rows = positive
    .sort((a, b) => b.amount - a.amount)
    .map((r) => ({ ...r, pct: safePct(r.amount, total) ?? 0 }));
  return { rows, total, hasNegative, negativeTotal };
}

/** Net spending per category (can be negative when refunds exceed spending). */
export function expenseByCategory(txs: Transaction[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== 'expense') continue;
    m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + expenseEffect(t));
  }
  return m;
}

export interface CategoryTrend {
  categoryId: string;
  current: number;
  previous: number;
  diff: number;
  pct: number | null;
  direction: 'up' | 'down' | 'flat' | 'new';
  /** Average monthly spend over recent complete months; null when there is no history. */
  avgMonthly: number | null;
}

export function categoryTrends(txs: Transaction[], month: MonthKey, today: string): CategoryTrend[] {
  const cmp = comparisonFor(month, today);
  const cur = expenseByCategory(filterPeriod(txs, cmp.current.from, cmp.current.to));
  const prev = expenseByCategory(filterPeriod(txs, cmp.previous.from, cmp.previous.to));
  const avg = averageMonthlyByCategory(txs, month, today, 6);
  const ids = new Set<string>([...cur.keys(), ...prev.keys(), ...avg.keys()]);
  const out: CategoryTrend[] = [];
  for (const categoryId of ids) {
    const c = cur.get(categoryId) ?? 0;
    const p = prev.get(categoryId) ?? 0;
    if (c === 0 && p === 0 && !avg.get(categoryId)) continue;
    const d = delta(c, p);
    let direction: CategoryTrend['direction'] = 'flat';
    if (p <= 0 && c > 0) direction = 'new';
    else if (d.pct !== null && d.pct >= 5) direction = 'up';
    else if (d.pct !== null && d.pct <= -5) direction = 'down';
    out.push({ categoryId, current: c, previous: p, diff: d.diff, pct: d.pct, direction, avgMonthly: avg.get(categoryId) ?? null });
  }
  return out.sort((a, b) => b.current - a.current || b.previous - a.previous);
}

/**
 * Average monthly spend per category across up to `months` complete months ending at `month`.
 * An in-progress month is excluded because a partial month would drag the average down.
 * Months before the user's first transaction are not counted.
 */
export function averageMonthlyByCategory(txs: Transaction[], month: MonthKey, today: string, months = 6): Map<string, number> {
  const todayKey = monthKeyOf(today);
  const lastKey = month >= todayKey ? addMonths(todayKey, -1) : month;
  const expenses = txs.filter((t) => t.type === 'expense');
  if (expenses.length === 0) return new Map();
  const firstKey = expenses.reduce((m, t) => (t.date < m ? t.date : m), expenses[0].date).slice(0, 7);
  const startKey = addMonths(lastKey, -(months - 1)) > firstKey ? addMonths(lastKey, -(months - 1)) : firstKey;
  const n = monthDiff(startKey, lastKey) + 1;
  if (n < 1) return new Map();
  const { from } = monthRange(startKey);
  const { to } = monthRange(lastKey);
  const totals = expenseByCategory(filterPeriod(txs, from, to));
  const out = new Map<string, number>();
  for (const [id, v] of totals) out.set(id, Math.round(v / n));
  return out;
}

/* ------------------------------------------------------------------ */
/* Balances                                                            */
/* ------------------------------------------------------------------ */

export function accountBalances(accounts: Account[], txs: Transaction[], asOf?: string): Map<string, number> {
  const bal = new Map<string, number>(accounts.map((a) => [a.id, a.openingBalance]));
  const add = (id: string | undefined, amt: number) => {
    if (id && bal.has(id)) bal.set(id, (bal.get(id) ?? 0) + amt);
  };
  for (const t of txs) {
    if (asOf && t.date > asOf) continue;
    if (t.type === 'income') add(t.accountId, t.amount);
    else if (t.type === 'expense') add(t.accountId, t.refund ? t.amount : -t.amount);
    else {
      add(t.accountId, -t.amount);
      add(t.toAccountId, t.amount);
    }
  }
  return bal;
}

export interface BalanceSummary {
  total: number;
  /** Money in spending accounts. */
  spending: number;
  /** Money held in savings accounts. */
  savings: number;
  byAccount: Map<string, number>;
}

export function balanceSummary(accounts: Account[], txs: Transaction[], asOf?: string): BalanceSummary {
  const byAccount = accountBalances(accounts, txs, asOf);
  let spending = 0;
  let savings = 0;
  for (const a of accounts) {
    const b = byAccount.get(a.id) ?? 0;
    if (a.kind === 'savings') savings += b;
    else spending += b;
  }
  return { total: spending + savings, spending, savings, byAccount };
}

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */

export type BudgetState = 'none' | 'ok' | 'near' | 'over';

export interface BudgetStatus {
  budget: number;
  spent: number;
  remaining: number;
  usedPct: number | null;
  state: BudgetState;
}

export const BUDGET_WARN_PCT = 80;

export function budgetStatus(spent: number, budget: number): BudgetStatus {
  const usedPct = safePct(Math.max(spent, 0), budget);
  let state: BudgetState = 'none';
  if (usedPct !== null) {
    if (usedPct > 100) state = 'over';
    else if (usedPct >= BUDGET_WARN_PCT) state = 'near';
    else state = 'ok';
  }
  return { budget, spent, remaining: budget - spent, usedPct, state };
}

export interface BudgetSummary {
  rows: (BudgetStatus & { categoryId: string })[];
  totalBudget: number;
  /** Spending in categories that have a budget. */
  budgetedSpent: number;
  /** Spending in categories with no budget set. */
  unbudgetedSpent: number;
  overall: BudgetStatus;
}

export function budgetSummary(budgets: Budget[], txs: Transaction[], month: MonthKey): BudgetSummary {
  const { from, to } = monthRange(month);
  const spend = expenseByCategory(filterPeriod(txs, from, to));
  const rows = budgets
    .filter((b) => b.amount > 0)
    .map((b) => ({ categoryId: b.categoryId, ...budgetStatus(spend.get(b.categoryId) ?? 0, b.amount) }));
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const budgetedSpent = rows.reduce((s, r) => s + r.spent, 0);
  const budgetedIds = new Set(rows.map((r) => r.categoryId));
  let unbudgetedSpent = 0;
  for (const [id, v] of spend) if (!budgetedIds.has(id)) unbudgetedSpent += v;
  return { rows, totalBudget, budgetedSpent, unbudgetedSpent, overall: budgetStatus(budgetedSpent, totalBudget) };
}

/* ------------------------------------------------------------------ */
/* Recurring spending detection                                        */
/* ------------------------------------------------------------------ */

export interface RecurringGroup {
  key: string;
  label: string;
  categoryId: string;
  typicalAmount: number;
  /** Median day of the month the charge usually lands on. */
  typicalDay: number;
  months: number;
  lastDate: string;
  txIds: string[];
}

/**
 * Spending that repeats like a bill: the same description in at least 3 different months,
 * never more than twice in one month, with broadly similar amounts. Coffee shops you visit
 * several times a month are intentionally not "recurring".
 */
export function detectRecurring(txs: Transaction[]): RecurringGroup[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.type !== 'expense' || t.refund) continue;
    const key = normalizeDescription(t.description);
    if (key.length < 2) continue;
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }
  const out: RecurringGroup[] = [];
  for (const [key, list] of groups) {
    const perMonth = new Map<string, number>();
    for (const t of list) perMonth.set(monthKeyOf(t.date), (perMonth.get(monthKeyOf(t.date)) ?? 0) + 1);
    if (perMonth.size < 3) continue;
    if ([...perMonth.values()].some((c) => c > 2)) continue;
    const amounts = list.map((t) => t.amount).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    if (median <= 0) continue;
    const similar = amounts.filter((a) => Math.abs(a - median) / median <= 0.25).length;
    if (similar / amounts.length < 0.7) continue;
    const days = list.map((t) => Number(t.date.slice(8, 10))).sort((a, b) => a - b);
    // A bill lands around the same day each month. A snack you happen to buy now and then does not.
    const medianDay = days[Math.floor(days.length / 2)];
    if (days.filter((d) => Math.abs(d - medianDay) <= 3).length / days.length < 0.75) continue;
    const last = list.reduce((m, t) => (t.date > m.date ? t : m), list[0]);
    out.push({
      key,
      label: last.description,
      categoryId: last.categoryId,
      typicalAmount: median,
      typicalDay: medianDay,
      months: perMonth.size,
      lastDate: last.date,
      txIds: list.map((t) => t.id),
    });
  }
  return out.sort((a, b) => b.typicalAmount - a.typicalAmount);
}

/* ------------------------------------------------------------------ */
/* Projection                                                          */
/* ------------------------------------------------------------------ */

export interface Projection {
  kind: 'final' | 'estimate' | 'too-early' | 'future';
  /** Spend so far (or the final figure). */
  spent: number;
  /** Estimated total for the month; only meaningful for kind 'estimate' | 'final'. */
  amount: number;
  daysElapsed: number;
  daysInMonth: number;
}

/**
 * Estimated end-of-month spending. Fixed bills (detected recurring charges) are counted as they
 * land, and only everyday spending is extrapolated, so rent paid on the 1st does not inflate the
 * estimate. It is an estimate, never a promise.
 */
export function projectMonthEnd(txs: Transaction[], month: MonthKey, today: string, recurring: RecurringGroup[]): Projection {
  const dim = daysInMonth(month);
  const { from, to } = monthRange(month);
  const todayKey = monthKeyOf(today);
  const monthTxs = filterPeriod(txs, from, to);
  const spent = summarize(monthTxs).expenses;
  if (month < todayKey) return { kind: 'final', spent, amount: spent, daysElapsed: dim, daysInMonth: dim };
  if (month > todayKey) return { kind: 'future', spent, amount: spent, daysElapsed: 0, daysInMonth: dim };

  const day = Number(today.slice(8, 10));
  if (day < 3) return { kind: 'too-early', spent, amount: spent, daysElapsed: day, daysInMonth: dim };

  const recurringIds = new Set(recurring.flatMap((g) => g.txIds));
  const toDate = monthTxs.filter((t) => t.date <= today);
  const variableSpent = toDate.filter((t) => !recurringIds.has(t.id)).reduce((s, t) => s + expenseEffect(t), 0);
  const fixedSpent = toDate.filter((t) => recurringIds.has(t.id)).reduce((s, t) => s + expenseEffect(t), 0);
  const futureLogged = monthTxs.filter((t) => t.date > today).reduce((s, t) => s + expenseEffect(t), 0);

  const prevKey = addMonths(month, -1);
  const upcoming = recurring
    .filter((g) => g.typicalDay > day && monthKeyOf(g.lastDate) >= prevKey && monthKeyOf(g.lastDate) < month)
    .reduce((s, g) => s + g.typicalAmount, 0);

  const perDay = Math.max(variableSpent, 0) / day;
  const amount = Math.round(fixedSpent + variableSpent + futureLogged + perDay * (dim - day) + upcoming);
  return { kind: 'estimate', spent, amount: Math.max(amount, spent), daysElapsed: day, daysInMonth: dim };
}

/* ------------------------------------------------------------------ */
/* Goals                                                               */
/* ------------------------------------------------------------------ */

/** What a transfer does to a goal's saved amount (only transfers tagged with that goal). */
export function goalTransferEffect(t: Transaction, accounts: Map<string, Account>): number {
  return t.goalId ? savingsTransferEffect(t, accounts) : 0;
}

export function goalSaved(goal: Goal, entries: GoalEntry[], txs: Transaction[], accounts: Account[]): number {
  const accMap = accountMap(accounts);
  let saved = goal.startingAmount;
  for (const e of entries) if (e.goalId === goal.id) saved += e.amount;
  for (const t of txs) if (t.goalId === goal.id) saved += goalTransferEffect(t, accMap);
  return saved;
}

export type GoalStatus = 'complete' | 'no-date' | 'on-track' | 'behind' | 'overdue';

export interface GoalProgress {
  saved: number;
  pct: number | null;
  /** 0-100 for progress bars. */
  barPct: number;
  remaining: number;
  status: GoalStatus;
  /** Roughly what to set aside each month to hit the date; null without a date or when complete. */
  requiredMonthly: number | null;
  daysLeft: number | null;
}

export function goalProgress(goal: Goal, saved: number, today: string): GoalProgress {
  const pct = safePct(Math.max(saved, 0), goal.target);
  const barPct = pct === null ? 0 : Math.min(100, Math.max(0, pct));
  const remaining = Math.max(0, goal.target - saved);
  const complete = goal.target > 0 && saved >= goal.target;
  let status: GoalStatus = 'no-date';
  let requiredMonthly: number | null = null;
  let daysLeft: number | null = null;

  if (goal.targetDate) {
    daysLeft = diffDays(today, goal.targetDate);
    if (!complete) {
      if (daysLeft < 0) status = 'overdue';
      else {
        const total = Math.max(1, diffDays(goal.startDate, goal.targetDate));
        const elapsed = Math.min(total, Math.max(0, diffDays(goal.startDate, today)));
        const expected = goal.startingAmount + (goal.target - goal.startingAmount) * (elapsed / total);
        status = saved >= expected ? 'on-track' : 'behind';
        requiredMonthly = Math.round(remaining / Math.max(1, daysLeft / 30.4375));
      }
    }
  }
  if (complete) status = 'complete';
  return { saved, pct, barPct, remaining, status, requiredMonthly, daysLeft };
}

export interface SavingsOverview {
  /** Money remaining after income and expenses in the period (net cash flow). */
  netCashFlow: number;
  /** Total held in savings accounts right now. */
  heldInSavings: number;
  /** Portion of savings assigned to goals. */
  allocatedToGoals: number;
  /** Savings not assigned to any goal. Negative means goals are over-allocated. */
  unallocated: number;
}

export function savingsOverview(data: AppData, month: MonthKey, asOf?: string): SavingsOverview {
  const netCashFlow = summarizeMonth(data.transactions, month, data.accounts).net;
  const held = balanceSummary(data.accounts, data.transactions, asOf).savings;
  const allocated = data.goals.reduce((s, g) => s + goalSaved(g, data.goalEntries, data.transactions, data.accounts), 0);
  return { netCashFlow, heldInSavings: held, allocatedToGoals: allocated, unallocated: held - allocated };
}

export type SavingsTargetStatus = 'unset' | 'met' | 'on-track' | 'behind';

export function savingsTargetStatus(
  net: number,
  target: number,
  month: MonthKey,
  today: string,
): { status: SavingsTargetStatus; pct: number | null } {
  if (target <= 0) return { status: 'unset', pct: null };
  const pct = safePct(Math.max(net, 0), target);
  if (net >= target) return { status: 'met', pct };
  const todayKey = monthKeyOf(today);
  if (month < todayKey) return { status: 'behind', pct };
  if (month > todayKey) return { status: 'on-track', pct };
  // In progress: on track when month-to-date net is at least the pro-rated target.
  const day = Number(today.slice(8, 10));
  const expected = target * (day / daysInMonth(month));
  return { status: net >= expected ? 'on-track' : 'behind', pct };
}

/** Milestones (percent) used for celebrations. */
export const MILESTONES = [25, 50, 75, 100] as const;

export function crossedMilestone(prevPct: number | null, nextPct: number | null): number | null {
  if (nextPct === null) return null;
  const before = prevPct ?? 0;
  let hit: number | null = null;
  for (const m of MILESTONES) if (before < m && nextPct >= m) hit = m;
  return hit;
}

/* ------------------------------------------------------------------ */
/* Time series                                                         */
/* ------------------------------------------------------------------ */

export type Granularity = 'week' | 'month' | 'year';

export interface Bucket {
  key: string;
  label: string;
  from: string;
  to: string;
  income: number;
  expenses: number;
  net: number;
  /** Cumulative net cash flow since the first transaction on record, at the end of this bucket. */
  cumulativeNet: number;
  /** Money held in savings accounts at the end of this bucket. */
  savingsBalance: number;
}

export function buildBuckets(
  data: Pick<AppData, 'transactions' | 'accounts'>,
  gran: Granularity,
  count: number,
  today: string,
  weekStartsOn: 0 | 1 = 1,
  /** Drop leading periods before the first transaction (keeping at least `minKeep` periods). */
  trim: { minKeep: number } | null = null,
): Bucket[] {
  const txs = data.transactions;
  const ranges: { key: string; label: string; from: string; to: string }[] = [];

  if (gran === 'month') {
    const endKey = monthKeyOf(today);
    for (let i = count - 1; i >= 0; i--) {
      const k = addMonths(endKey, -i);
      const r = monthRange(k);
      ranges.push({ key: k, label: formatMonthName(k, 'short'), ...r });
    }
  } else if (gran === 'week') {
    const endStart = weekStartOf(today, weekStartsOn);
    for (let i = count - 1; i >= 0; i--) {
      const from = addDays(endStart, -7 * i);
      ranges.push({ key: from, label: formatDate(from, { day: 'numeric', month: 'short' }), from, to: addDays(from, 6) });
    }
  } else {
    const endYear = yearOf(today);
    const firstYear = txs.length ? Math.min(...txs.map((t) => yearOf(t.date))) : endYear;
    const startYear = Math.max(firstYear, endYear - count + 1);
    for (let y = startYear; y <= endYear; y++) {
      ranges.push({ key: String(y), label: String(y), from: `${y}-01-01`, to: `${y}-12-31` });
    }
  }

  if (trim && txs.length > 0) {
    const first = txs.reduce((m, t) => (t.date < m ? t.date : m), txs[0].date);
    const kept = ranges.filter((r) => r.to >= first);
    ranges.splice(0, ranges.length, ...(kept.length >= Math.min(trim.minKeep, ranges.length) ? kept : ranges.slice(-trim.minKeep)));
  }

  const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const accMap = accountMap(data.accounts);
  const savingsOpening = data.accounts.filter((a) => a.kind === 'savings').reduce((s, a) => s + a.openingBalance, 0);
  const savingsKind = new Set(data.accounts.filter((a) => a.kind === 'savings').map((a) => a.id));

  let idx = 0;
  let cumNet = 0;
  let savingsBal = savingsOpening;
  const consume = (t: Transaction) => {
    cumNet += incomeEffect(t) - expenseEffect(t);
    if (t.type === 'transfer') savingsBal += savingsTransferEffect(t, accMap);
    else if (savingsKind.has(t.accountId)) {
      if (t.type === 'income') savingsBal += t.amount;
      else if (t.type === 'expense') savingsBal += t.refund ? t.amount : -t.amount;
    }
  };
  // Everything before the first bucket contributes to the running totals.
  while (idx < sorted.length && ranges.length && sorted[idx].date < ranges[0].from) consume(sorted[idx++]);

  return ranges.map((r) => {
    let income = 0;
    let expenses = 0;
    while (idx < sorted.length && sorted[idx].date <= r.to) {
      const t = sorted[idx++];
      income += incomeEffect(t);
      expenses += expenseEffect(t);
      consume(t);
    }
    return { ...r, income, expenses, net: income - expenses, cumulativeNet: cumNet, savingsBalance: savingsBal };
  });
}

/* ------------------------------------------------------------------ */
/* Days                                                                */
/* ------------------------------------------------------------------ */

export interface DayTotals {
  income: number;
  expenses: number;
  count: number;
}

export function dailyTotals(txs: Transaction[]): Map<string, DayTotals> {
  const m = new Map<string, DayTotals>();
  for (const t of txs) {
    const d = m.get(t.date) ?? { income: 0, expenses: 0, count: 0 };
    d.income += incomeEffect(t);
    d.expenses += expenseEffect(t);
    d.count += 1;
    m.set(t.date, d);
  }
  return m;
}

/**
 * Days whose everyday spending is well above the month's norm. Recurring bills are left out of
 * the comparison, otherwise rent day would be flagged every single month.
 */
export function unusualDays(monthTxs: Transaction[], recurring: RecurringGroup[]): Set<string> {
  const recurringIds = new Set(recurring.flatMap((g) => g.txIds));
  const byDay = new Map<string, number>();
  for (const t of monthTxs) {
    if (t.type !== 'expense' || recurringIds.has(t.id)) continue;
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + expenseEffect(t));
  }
  const values = [...byDay.values()].filter((v) => v > 0);
  if (values.length < 5) return new Set();
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  const threshold = mean + 1.5 * sd;
  const out = new Set<string>();
  for (const [d, v] of byDay) if (v > threshold && v > mean * 1.8) out.add(d);
  return out;
}

/* ------------------------------------------------------------------ */
/* Misc helpers                                                        */
/* ------------------------------------------------------------------ */

export function categoryById(categories: Category[]): Map<string, Category> {
  return new Map(categories.map((c) => [c.id, c]));
}

export function distinctTags(txs: Transaction[]): string[] {
  const s = new Set<string>();
  for (const t of txs) for (const tag of t.tags) s.add(tag);
  return [...s].sort((a, b) => a.localeCompare(b));
}

export function monthsWithData(txs: Transaction[]): MonthKey[] {
  return [...new Set(txs.map((t) => monthKeyOf(t.date)))].sort();
}
