import { ArrowDownRight, ArrowUpRight, BarChart3, ExternalLink, Lightbulb, LineChart as LineIcon, PieChart as PieIcon, Table2, TrendingUp, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { CategoryChip, CategoryDot, CategoryIcon } from '../../components/category/CategoryChip';
import { DonutChart, IncomeExpenseChart, SavingsLineChart, Sparkline, SwatchLegend } from '../../components/charts/charts';
import { TransactionRow } from '../../components/transactions/TransactionRow';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, PageHeader } from '../../components/ui/Card';
import { EmptyState, InfoTip, ProgressBar } from '../../components/ui/Feedback';
import { Segmented } from '../../components/ui/Form';
import {
  buildBuckets,
  categoryBreakdown,
  categoryById,
  categoryTrends,
  comparisonFor,
  expenseByCategory,
  filterPeriod,
  summarize,
  type Granularity,
} from '../../domain/calc';
import { addMonths, diffDays, formatMonthLabel, monthRange, monthsInRange, type MonthKey } from '../../domain/dates';
import { generateInsights, type Insight } from '../../domain/insights';
import { formatPct } from '../../domain/money';
import { useMoney, useStore } from '../../state/store';
import { useUi } from '../../state/ui';

type RangeKey = 'month' | '3m' | '6m' | 'ytd' | '12m' | 'all';

const RANGE_LABEL: Record<RangeKey, string> = { month: 'Month', '3m': '3 months', '6m': '6 months', ytd: 'Year to date', '12m': '12 months', all: 'All time' };

function rangeFor(range: RangeKey, month: MonthKey, firstDate: string | null): { from: string; to: string; label: string } {
  const end = monthRange(month).to;
  switch (range) {
    case 'month':
      return { ...monthRange(month), label: formatMonthLabel(month) };
    case '3m':
      return { from: monthRange(addMonths(month, -2)).from, to: end, label: `${formatMonthLabel(addMonths(month, -2), 'short')} – ${formatMonthLabel(month, 'short')}` };
    case '6m':
      return { from: monthRange(addMonths(month, -5)).from, to: end, label: `${formatMonthLabel(addMonths(month, -5), 'short')} – ${formatMonthLabel(month, 'short')}` };
    case '12m':
      return { from: monthRange(addMonths(month, -11)).from, to: end, label: `${formatMonthLabel(addMonths(month, -11), 'short')} – ${formatMonthLabel(month, 'short')}` };
    case 'ytd':
      return { from: `${month.slice(0, 4)}-01-01`, to: end, label: `${month.slice(0, 4)} to date` };
    default:
      return { from: firstDate ?? monthRange(month).from, to: end, label: 'All time' };
  }
}

function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="max-h-72 overflow-auto rounded-2xl border border-line">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface2 text-xs text-muted">
          <tr>{head.map((h, i) => <th key={h} scope="col" className={`px-3 py-2 font-medium ${i > 0 ? 'text-right' : ''}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className={`px-3 py-2 tabular-nums ${j > 0 ? 'text-right' : 'text-ink'}`}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ViewToggle({ value, onChange }: { value: 'chart' | 'table'; onChange: (v: 'chart' | 'table') => void }) {
  return (
    <Segmented<'chart' | 'table'>
      ariaLabel="Chart or table view"
      size="sm"
      value={value}
      onChange={onChange}
      options={[
        { value: 'chart', label: <span className="inline-flex items-center gap-1"><BarChart3 size={12} /> Chart</span> },
        { value: 'table', label: <span className="inline-flex items-center gap-1"><Table2 size={12} /> Table</span> },
      ]}
    />
  );
}

const TONE: Record<Insight['tone'], string> = { good: 'bg-sage-soft text-sage-deep', neutral: 'bg-blue-soft text-blue-deep', attention: 'bg-peach-soft text-peach-deep' };

export function AnalyticsPage() {
  const { data, today } = useStore();
  const { fmt } = useMoney();
  const { month, navigate } = useUi();
  const [range, setRange] = useState<RangeKey>('month');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [gran, setGran] = useState<Granularity>('month');
  const [flowView, setFlowView] = useState<'chart' | 'table'>('chart');
  const [lineView, setLineView] = useState<'chart' | 'table'>('chart');

  const catMap = useMemo(() => categoryById(data.categories), [data.categories]);
  const firstDate = useMemo(() => data.transactions.reduce<string | null>((m, t) => (m === null || t.date < m ? t.date : m), null), [data.transactions]);
  const lastDate = useMemo(() => data.transactions.reduce<string | null>((m, t) => (m === null || t.date > m ? t.date : m), null), [data.transactions]);
  const r = useMemo(() => rangeFor(range, month, firstDate), [range, month, firstDate]);

  const periodTxs = useMemo(() => filterPeriod(data.transactions, r.from, r.to), [data.transactions, r]);
  const breakdown = useMemo(() => categoryBreakdown(periodTxs, 'expense'), [periodTxs]);
  const summary = useMemo(() => summarize(periodTxs, data.accounts), [periodTxs, data.accounts]);

  // Per-category detail for the distribution table
  const detail = useMemo(() => {
    const out = new Map<string, { count: number; largest: number }>();
    for (const t of periodTxs) {
      if (t.type !== 'expense' || t.refund) continue;
      const d = out.get(t.categoryId) ?? { count: 0, largest: 0 };
      d.count += 1;
      d.largest = Math.max(d.largest, t.amount);
      out.set(t.categoryId, d);
    }
    return out;
  }, [periodTxs]);

  const donutData = breakdown.rows.map((row) => {
    const c = catMap.get(row.categoryId);
    return { id: row.categoryId, name: c?.name ?? 'Uncategorized', color: c?.color ?? '#B8AFA0', value: row.amount, pct: row.pct };
  });

  const drill = selectedCat ? periodTxs.filter((t) => t.type === 'expense' && t.categoryId === selectedCat).sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
  const selectedCategory = selectedCat ? catMap.get(selectedCat) : undefined;

  // Time-series availability
  const spanDays = firstDate && lastDate ? diffDays(firstDate, lastDate) : 0;
  const years = new Set(data.transactions.map((t) => t.date.slice(0, 4))).size;
  const canWeek = spanDays >= 14;
  const canYear = years >= 2;
  const effGran: Granularity = (gran === 'week' && !canWeek) || (gran === 'year' && !canYear) ? 'month' : gran;
  const buckets = useMemo(() => buildBuckets(data, effGran, effGran === 'week' ? 12 : effGran === 'month' ? 12 : 6, today, data.settings.weekStartsOn, { minKeep: 4 }), [data, effGran, today]);
  const hasFlow = buckets.some((b) => b.income > 0 || b.expenses > 0);

  // Trends
  const trends = useMemo(() => categoryTrends(data.transactions, month, today), [data.transactions, month, today]);
  const cmp = comparisonFor(month, today);
  const spark = useMemo(() => {
    const keys = monthsInRange(addMonths(month, -5), month);
    const perMonth = keys.map((k) => expenseByCategory(filterPeriod(data.transactions, monthRange(k).from, monthRange(k).to)));
    return (id: string) => perMonth.map((m) => Math.max(0, m.get(id) ?? 0));
  }, [data.transactions, month]);

  const insights = useMemo(() => generateInsights(data, month, today), [data, month, today]);

  if (data.transactions.length === 0) {
    return (
      <>
        <PageHeader title="Analytics" subtitle="See exactly where your money goes." />
        <Card><EmptyState title="Nothing to analyse yet" action={<Button variant="primary" onClick={() => navigate('/transactions')}>Go to transactions</Button>}>Once you’ve recorded a few transactions, you’ll see breakdowns, trends and comparisons here.</EmptyState></Card>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        subtitle="Every figure here is worked out from your own transactions."
        actions={
          <Segmented<RangeKey>
            ariaLabel="Time range for the breakdown"
            size="sm"
            value={range}
            onChange={(v) => { setRange(v); setSelectedCat(null); }}
            options={(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => ({ value: k, label: k === 'month' ? formatMonthLabel(month, 'short').replace(/ \d+$/, '') : RANGE_LABEL[k], ariaLabel: RANGE_LABEL[k] }))}
          />
        }
      />

      {/* A. Breakdown */}
      <Card aria-labelledby="breakdown-title">
        <CardHeader
          id="breakdown-title"
          icon={<PieIcon size={17} />}
          title="Where your money went"
          subtitle={`${r.label} · ${breakdown.rows.length ? `${fmt(breakdown.total)} spent across ${breakdown.rows.length} categor${breakdown.rows.length === 1 ? 'y' : 'ies'}` : 'no spending in this period'}`}
        />
        {breakdown.rows.length === 0 ? (
          <EmptyState compact title="No spending in this period">Try a longer range, or add some expenses.</EmptyState>
        ) : (
          <div className="grid items-center gap-6 lg:grid-cols-2">
            <DonutChart data={donutData} total={breakdown.total} selectedId={selectedCat} onSelect={(id) => setSelectedCat((c) => (c === id ? null : id))} height={300} />
            <div>
              <ul className="flex flex-col" aria-label="Categories, with amount and share of spending">
                {breakdown.rows.map((row) => {
                  const c = catMap.get(row.categoryId);
                  const active = selectedCat === row.categoryId;
                  return (
                    <li key={row.categoryId}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedCat(active ? null : row.categoryId)}
                        className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-surface2 ${active ? 'bg-sage-soft' : ''} ${selectedCat && !active ? 'opacity-60' : ''}`}
                      >
                        <CategoryDot color={c?.color ?? '#B8AFA0'} size={12} />
                        <span aria-hidden className="text-base">{c?.icon}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{c?.name ?? 'Uncategorized'}</span>
                        <span className="text-sm font-medium tabular-nums text-ink">{fmt(row.amount)}</span>
                        <span className="w-14 text-right text-sm tabular-nums text-muted">{formatPct(row.pct, 1)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {breakdown.hasNegative && <p className="mt-2 px-2.5 text-xs text-muted">Refunds of {fmt(-breakdown.negativeTotal)} are bigger than the spending in their categories, so those categories are left out of the chart. They are still netted off your total expenses ({fmt(breakdown.total + breakdown.negativeTotal)}).</p>}
            </div>
          </div>
        )}

        {selectedCat && (
          <div className="mt-6 rounded-2xl border border-line bg-surface2/50 p-3 [animation:fade-in_0.2s_ease_both] sm:p-4" role="region" aria-label={`Transactions in ${selectedCategory?.name}`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <CategoryChip category={selectedCategory} />
                <span className="text-sm text-muted">{drill.length} transaction{drill.length === 1 ? '' : 's'} · {r.label}</span>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" icon={<ExternalLink size={13} />} onClick={() => navigate(`/transactions?category=${selectedCat}${range === 'month' ? `&month=${month}` : '&period=all'}`)}>Open in Transactions</Button>
                <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => setSelectedCat(null)}>Close</Button>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {drill.map((t) => <TransactionRow key={t.id} tx={t} category={catMap.get(t.categoryId)} accounts={data.accounts} />)}
            </div>
          </div>
        )}
      </Card>

      {/* B. Distribution */}
      {breakdown.rows.length > 0 && (
        <Card aria-labelledby="dist-title">
          <CardHeader
            id="dist-title"
            title={<span className="inline-flex items-center gap-1.5">Spending distribution <InfoTip text="Each category's share = the category's spending ÷ total spending × 100. Refunds are netted off their category." /></span>}
            subtitle="Ranked by share of your total spending"
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <caption className="sr-only">Spending by category with share, number of transactions, and average transaction</caption>
              <thead className="text-xs text-muted">
                <tr>
                  <th scope="col" className="pb-2 font-medium">Category</th>
                  <th scope="col" className="w-[34%] pb-2 font-medium">Share of spending</th>
                  <th scope="col" className="pb-2 text-right font-medium">Amount</th>
                  <th scope="col" className="pb-2 text-right font-medium">Transactions</th>
                  <th scope="col" className="pb-2 text-right font-medium">Average</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.rows.map((row) => {
                  const c = catMap.get(row.categoryId);
                  const d = detail.get(row.categoryId);
                  return (
                    <tr key={row.categoryId} className="border-t border-line">
                      <td className="py-2.5 pr-3"><span className="flex items-center gap-2.5"><CategoryIcon category={c} size={30} /><span className="truncate font-medium text-ink">{c?.name}</span></span></td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <ProgressBar pct={row.pct} color={c?.color} label={`${c?.name} share`} className="flex-1" height="sm" />
                          <span className="w-12 text-right tabular-nums text-ink">{formatPct(row.pct, 1)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-ink">{fmt(row.amount)}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted">{d?.count ?? row.count}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted">{d && d.count > 0 ? fmt(Math.round(row.amount / d.count)) : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line2 font-semibold text-ink">
                  <td className="pt-3">Total</td>
                  <td className="pt-3 tabular-nums">100%</td>
                  <td className="pt-3 text-right tabular-nums">{fmt(breakdown.total)}</td>
                  <td className="pt-3 text-right tabular-nums text-muted">{[...detail.values()].reduce((s, d) => s + d.count, 0)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">Income in this period: {fmt(summary.income)} · Net: {fmt(summary.net, { signed: true })}</p>
        </Card>
      )}

      {/* C. Income vs expenses */}
      <Card aria-labelledby="flow-title">
        <CardHeader
          id="flow-title"
          icon={<BarChart3 size={17} />}
          title="Income vs expenses"
          subtitle={effGran === 'week' ? 'The last 12 weeks' : effGran === 'month' ? 'The last 12 months' : 'By year'}
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Segmented<Granularity>
                ariaLabel="Group by"
                size="sm"
                value={effGran}
                onChange={setGran}
                options={[
                  { value: 'week', label: canWeek ? 'Weekly' : <span title="Needs at least two weeks of data" className="opacity-50">Weekly</span> },
                  { value: 'month', label: 'Monthly' },
                  { value: 'year', label: canYear ? 'Yearly' : <span title="Needs more than one year of data" className="opacity-50">Yearly</span> },
                ]}
              />
              <ViewToggle value={flowView} onChange={setFlowView} />
            </div>
          }
        />
        {!hasFlow ? (
          <EmptyState compact title="Nothing in this window">Add transactions, or choose a different grouping.</EmptyState>
        ) : flowView === 'chart' ? (
          <IncomeExpenseChart buckets={buckets} height={300} />
        ) : (
          <DataTable caption="Income and expenses by period" head={['Period', 'Income', 'Expenses', 'Net']} rows={buckets.map((b) => [b.label, fmt(b.income), fmt(b.expenses), fmt(b.net, { signed: true })])} />
        )}
        {(!canWeek || !canYear) && <p className="mt-2 text-xs text-muted">{!canWeek ? 'Weekly view unlocks after two weeks of data. ' : ''}{!canYear ? 'Yearly view unlocks once you have more than one year.' : ''}</p>}
      </Card>

      <Card aria-labelledby="line-title">
        <CardHeader
          id="line-title"
          icon={<LineIcon size={17} />}
          title="How your savings are changing"
          subtitle="Running total of income minus expenses, and the money actually sitting in savings accounts"
          action={<ViewToggle value={lineView} onChange={setLineView} />}
        />
        {!hasFlow ? (
          <EmptyState compact title="Nothing to chart yet">Savings build up as income outpaces spending.</EmptyState>
        ) : lineView === 'chart' ? (
          <SavingsLineChart buckets={buckets} height={280} />
        ) : (
          <DataTable caption="Savings over time" head={['Period', 'Cumulative net', 'In savings accounts']} rows={buckets.map((b) => [b.label, fmt(b.cumulativeNet), fmt(b.savingsBalance)])} />
        )}
        <div className="mt-3">
          <SwatchLegend items={[{ color: 'var(--c-ink)', label: 'Cumulative net = all income − all expenses since your first transaction' }, { color: 'var(--c-blue-deep)', label: 'In savings accounts = opening balance + transfers in' }]} />
        </div>
      </Card>

      {/* D. Trends */}
      <Card aria-labelledby="trend-title">
        <CardHeader
          id="trend-title"
          icon={<TrendingUp size={17} />}
          title="Category trends"
          subtitle={`${formatMonthLabel(month)}${cmp.partial ? ' so far' : ''} compared with ${cmp.previousLabel}`}
        />
        {trends.length === 0 ? (
          <EmptyState compact title="No category history yet">Trends appear once you have spending in more than one month.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Category spending compared with the previous period, with 6-month average</caption>
              <thead className="text-xs text-muted">
                <tr>
                  <th scope="col" className="pb-2 font-medium">Category</th>
                  <th scope="col" className="pb-2 text-right font-medium">{cmp.partial ? 'So far' : 'This month'}</th>
                  <th scope="col" className="pb-2 text-right font-medium">{cmp.partial ? 'Same point last month' : 'Last month'}</th>
                  <th scope="col" className="pb-2 text-right font-medium">Change</th>
                  <th scope="col" className="pb-2 text-right font-medium"><span className="inline-flex items-center gap-1">Monthly avg <InfoTip text="Average per month across up to six completed months. The month in progress is left out so it doesn't pull the average down." /></span></th>
                  <th scope="col" className="pb-2 pl-4 font-medium">6 months</th>
                </tr>
              </thead>
              <tbody>
                {trends.map((t) => {
                  const c = catMap.get(t.categoryId);
                  const up = t.direction === 'up' || t.direction === 'new';
                  return (
                    <tr key={t.categoryId} className="border-t border-line">
                      <td className="py-2.5 pr-3"><CategoryChip category={c} size="sm" /></td>
                      <td className="py-2.5 text-right font-medium tabular-nums text-ink">{fmt(t.current)}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted">{fmt(t.previous)}</td>
                      <td className="py-2.5 text-right">
                        {t.direction === 'flat' ? <span className="text-muted">-</span> : t.direction === 'new' ? <span className="rounded-full bg-blue-soft px-2 py-0.5 text-xs font-semibold text-blue-deep">New</span> : (
                          <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${up ? 'bg-peach-soft text-peach-deep' : 'bg-sage-soft text-sage-deep'}`}>
                            {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {t.pct === null ? '' : `${Math.round(Math.abs(t.pct))}%`}
                            <span className="sr-only">{up ? 'increase' : 'decrease'}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted">{t.avgMonthly === null ? '-' : fmt(t.avgMonthly)}</td>
                      <td className="py-2.5 pl-4"><Sparkline values={spark(t.categoryId)} color={up ? 'var(--c-peach-deep)' : 'var(--c-sage-deep)'} label={`${c?.name ?? 'Category'} spending over six months`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* E. Insights */}
      <Card aria-labelledby="ins-title">
        <CardHeader id="ins-title" icon={<Lightbulb size={17} />} title="Insights" subtitle={`About ${formatMonthLabel(month)}, calculated from your transactions`} />
        <ul className="grid gap-3 sm:grid-cols-2">
          {insights.map((i) => (
            <li key={i.id} className="flex items-start gap-3 rounded-2xl bg-surface2/60 p-3.5">
              <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${TONE[i.tone]}`} aria-hidden>{i.tone === 'good' ? '✓' : i.tone === 'attention' ? '!' : 'i'}</span>
              <p className="text-sm leading-snug text-body">
                {i.text}
                {i.link && <button type="button" className="ml-1.5 font-medium text-sage-deep hover:underline" onClick={() => navigate(i.link!.to)}>{i.link.label} →</button>}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
