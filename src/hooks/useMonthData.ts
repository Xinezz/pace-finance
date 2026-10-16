import { useMemo } from 'react';
import {
  balanceSummary,
  budgetSummary,
  categoryBreakdown,
  comparisonFor,
  detectRecurring,
  filterPeriod,
  savingsOverview,
  summarize,
} from '../domain/calc';
import { monthRange, type MonthKey } from '../domain/dates';
import { useStore } from '../state/store';

/** Everything pages need about one month, computed once from the single source of truth in domain/calc. */
export function useMonthData(month: MonthKey) {
  const { data, today } = useStore();

  return useMemo(() => {
    const { from, to } = monthRange(month);
    const monthTxs = filterPeriod(data.transactions, from, to);
    const summary = summarize(monthTxs, data.accounts);
    const cmp = comparisonFor(month, today);
    const current = cmp.partial ? summarize(filterPeriod(data.transactions, cmp.current.from, cmp.current.to)) : summary;
    const previous = summarize(filterPeriod(data.transactions, cmp.previous.from, cmp.previous.to));
    const breakdown = categoryBreakdown(monthTxs, 'expense');
    const recurring = detectRecurring(data.transactions);
    const balances = balanceSummary(data.accounts, data.transactions);
    const savings = savingsOverview(data, month);
    const budgets = budgetSummary(data.budgets, data.transactions, month);
    return { from, to, monthTxs, summary, cmp, current, previous, breakdown, recurring, balances, savings, budgets };
  }, [data, month, today]);
}
