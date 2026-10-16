import { Download, FileText, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CategoryChip } from '../../components/category/CategoryChip';
import { IncomeExpenseChart } from '../../components/charts/charts';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, PageHeader } from '../../components/ui/Card';
import { Badge, EmptyState, ProgressBar } from '../../components/ui/Feedback';
import { Segmented, Select } from '../../components/ui/Form';
import { type Bucket } from '../../domain/calc';
import { filterPeriod } from '../../domain/calc';
import { formatDate, formatMonthLabel, formatMonthName, monthRange, yearOf } from '../../domain/dates';
import { transactionsToCsv } from '../../domain/importer';
import { formatPct } from '../../domain/money';
import { annualReport, monthOverMonth, monthlyReport, reportToMarkdown, savingsReport } from '../../domain/report';
import { downloadText } from '../../lib/download';
import { useFeedback } from '../../state/feedback';
import { useMoney, useStore } from '../../state/store';
import { useUi } from '../../state/ui';
import type { ReactNode } from 'react';

type Tab = 'monthly' | 'annual' | 'categories' | 'savings' | 'compare';

function Delta({ pct, goodWhen }: { pct: number | null; goodWhen: 'up' | 'down' }) {
  if (pct === null) return <span className="text-muted">-</span>;
  const r = Math.round(pct);
  if (r === 0) return <span className="text-muted">0%</span>;
  const good = (r > 0 && goodWhen === 'up') || (r < 0 && goodWhen === 'down');
  return <span className={`tabular-nums font-medium ${good ? 'text-sage-deep' : 'text-peach-deep'}`}>{r > 0 ? '▲' : '▼'} {Math.abs(r)}%</span>;
}

function Table({ caption, head, children, foot }: { caption: string; head: { label: string; right?: boolean }[]; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-xs text-muted">
          <tr>{head.map((h) => <th key={h.label} scope="col" className={`pb-2 font-medium ${h.right ? 'text-right' : ''}`}>{h.label}</th>)}</tr>
        </thead>
        <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:py-2.5 [&_td:not(:first-child)]:text-right [&_td]:tabular-nums">{children}</tbody>
        {foot && <tfoot className="[&_td]:border-t-2 [&_td]:border-line2 [&_td]:pt-3 [&_td]:font-semibold [&_td]:text-ink [&_td:not(:first-child)]:text-right [&_td]:tabular-nums">{foot}</tfoot>}
      </table>
    </div>
  );
}

export function ReportsPage() {
  const { data, today } = useStore();
  const { fmt } = useMoney();
  const { month } = useUi();
  const { toast } = useFeedback();
  const [tab, setTab] = useState<Tab>('monthly');
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));
  const catMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);

  const years = useMemo(() => {
    const ys = new Set(data.transactions.map((t) => yearOf(t.date)));
    ys.add(Number(today.slice(0, 4)));
    ys.add(Number(month.slice(0, 4)));
    return [...ys].sort((a, b) => b - a);
  }, [data.transactions, today, month]);

  const monthly = useMemo(() => monthlyReport(data, month), [data, month]);
  const annual = useMemo(() => annualReport(data, year), [data, year]);
  const mom = useMemo(() => monthOverMonth(data, month, 6), [data, month]);
  const sav = useMemo(() => savingsReport(data, year, today), [data, year, today]);
  const annualBuckets: Bucket[] = annual.rows.map((r) => ({ key: r.month, label: formatMonthName(r.month, 'short'), from: monthRange(r.month).from, to: monthRange(r.month).to, income: r.income, expenses: r.expenses, net: r.net, cumulativeNet: 0, savingsBalance: 0 }));

  const exportPeriod = () => {
    const range = tab === 'monthly' || tab === 'compare' ? monthRange(month) : { from: `${year}-01-01`, to: `${year}-12-31` };
    const txs = filterPeriod(data.transactions, range.from, range.to);
    downloadText(`pace-transactions-${range.from.slice(0, tab === 'monthly' || tab === 'compare' ? 7 : 4)}.csv`, transactionsToCsv(txs, data), 'text/csv');
    toast(`Exported ${txs.length} transaction${txs.length === 1 ? '' : 's'}.`);
  };
  const downloadSummary = () => {
    downloadText(`pace-summary-${month}.md`, reportToMarkdown(data, month, today), 'text/markdown');
    toast('Summary downloaded.');
  };

  const noData = data.transactions.length === 0;
  const m = monthly;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        subtitle="Summaries you can read, print or take with you."
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button icon={<Printer size={15} />} onClick={() => window.print()}>Print / save as PDF</Button>
            <Button icon={<FileText size={15} />} onClick={downloadSummary}>Download summary</Button>
            <Button icon={<Download size={15} />} onClick={exportPeriod} disabled={noData}>Export CSV</Button>
          </div>
        }
      />

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Segmented<Tab>
          ariaLabel="Report type"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'annual', label: 'Annual' },
            { value: 'categories', label: 'Categories' },
            { value: 'savings', label: 'Savings' },
            { value: 'compare', label: 'Month by month' },
          ]}
        />
        {(tab === 'annual' || tab === 'categories' || tab === 'savings') && (
          <Select aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} className="!w-auto">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        )}
      </div>

      {noData ? (
        <Card><EmptyState title="No data to report on yet">Reports are built from your transactions. Add a few and they’ll appear here.</EmptyState></Card>
      ) : (
        <>
          {tab === 'monthly' && (
            <>
              <Card aria-labelledby="mr-title">
                <CardHeader id="mr-title" title={`Monthly summary · ${formatMonthLabel(month)}`} subtitle={month === today.slice(0, 7) ? 'This month is still in progress. Compared with the whole of last month.' : 'Compared with the month before'} />
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    { l: 'Income', v: fmt(m.summary.income), d: <Delta pct={m.incomeDelta.pct} goodWhen="up" /> },
                    { l: 'Expenses', v: fmt(m.summary.expenses), d: <Delta pct={m.expenseDelta.pct} goodWhen="down" /> },
                    { l: 'Net cash flow', v: fmt(m.summary.net, { signed: m.summary.net < 0 }), d: <span className="text-muted">was {fmt(m.previous.net, { trimWhole: true })}</span> },
                    { l: 'Savings rate', v: formatPct(m.summary.savingsRate), d: <span className="text-muted">was {formatPct(m.previous.savingsRate)}</span> },
                  ].map((x) => (
                    <div key={x.l} className="rounded-2xl bg-surface2/70 p-4">
                      <dt className="text-xs text-muted">{x.l}</dt>
                      <dd className="mt-1 font-serif text-2xl tabular-nums text-ink">{x.v}</dd>
                      <dd className="mt-1 text-xs">{x.d}</dd>
                    </div>
                  ))}
                </dl>
                {m.uncategorized > 0 && <p className="mt-4 text-sm text-peach-deep">{m.uncategorized} transaction{m.uncategorized === 1 ? '' : 's'} this month still need a category, so category figures may be incomplete.</p>}
              </Card>
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="lg:col-span-2" aria-labelledby="mr-cat">
                  <CardHeader id="mr-cat" title="Spending by category" />
                  {m.categories.length === 0 ? <p className="text-sm text-muted">No spending this month.</p> : (
                    <Table caption="Spending by category this month" head={[{ label: 'Category' }, { label: 'Amount', right: true }, { label: 'Share', right: true }, { label: 'Last month', right: true }]}>
                      {m.categories.map((c) => (
                        <tr key={c.categoryId}><td><CategoryChip category={catMap.get(c.categoryId)} size="sm" /></td><td>{fmt(c.amount)}</td><td>{formatPct(c.pct, 1)}</td><td className="text-muted">{fmt(c.previousAmount)}</td></tr>
                      ))}
                    </Table>
                  )}
                </Card>
                <div className="contents">
                  <Card aria-labelledby="mr-big">
                    <CardHeader id="mr-big" title="Biggest expenses" />
                    {m.biggest.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
                      <ul className="divide-y divide-line">
                        {m.biggest.map((t) => (
                          <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                            <span className="min-w-0"><span className="block truncate text-ink">{t.description}</span><span className="text-xs text-muted">{formatDate(t.date, { day: 'numeric', month: 'short' })}</span></span>
                            <span className="tabular-nums font-medium text-ink">{fmt(t.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                  <Card aria-labelledby="mr-bud">
                    <CardHeader id="mr-bud" title="Budget performance" />
                    {m.budgets.rows.length === 0 ? <p className="text-sm text-muted">No budgets set.</p> : (
                      <ul className="flex flex-col gap-3">
                        {m.budgets.rows.map((b) => (
                          <li key={b.categoryId}>
                            <div className="mb-1 flex justify-between text-sm"><span className="text-ink">{catMap.get(b.categoryId)?.name}</span><span className="tabular-nums text-muted">{fmt(b.spent, { trimWhole: true })} / {fmt(b.budget, { trimWhole: true })} · {formatPct(b.usedPct)}</span></div>
                            <ProgressBar pct={b.usedPct ?? 0} color={b.state === 'over' ? 'var(--c-peach)' : b.state === 'near' ? 'var(--c-butter)' : 'var(--c-sage)'} label={`${catMap.get(b.categoryId)?.name} budget used`} height="sm" />
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>
              </div>
            </>
          )}

          {tab === 'annual' && (
            <>
              <Card aria-labelledby="ar-title">
                <CardHeader id="ar-title" title={`${year} at a glance`} subtitle="Income, expenses and what was left each month" />
                <dl className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    { l: 'Income', v: fmt(annual.total.income) },
                    { l: 'Expenses', v: fmt(annual.total.expenses) },
                    { l: 'Net', v: fmt(annual.total.net, { signed: annual.total.net < 0 }) },
                    { l: 'Savings rate', v: formatPct(annual.total.savingsRate) },
                  ].map((x) => <div key={x.l} className="rounded-2xl bg-surface2/70 p-4"><dt className="text-xs text-muted">{x.l}</dt><dd className="mt-1 font-serif text-2xl tabular-nums text-ink">{x.v}</dd></div>)}
                </dl>
                {annual.rows.some((r) => r.hasData) ? <IncomeExpenseChart buckets={annualBuckets} height={260} /> : <EmptyState compact title={`No activity in ${year}`}>Pick another year.</EmptyState>}
                {annual.bestMonth && annual.priciestMonth && (
                  <p className="mt-3 text-sm text-muted">Best month: <strong className="text-ink">{formatMonthLabel(annual.bestMonth.month)}</strong> ({fmt(annual.bestMonth.net, { trimWhole: true })} left). Highest spending: <strong className="text-ink">{formatMonthLabel(annual.priciestMonth.month)}</strong> ({fmt(annual.priciestMonth.expenses, { trimWhole: true })}).</p>
                )}
              </Card>
              <Card aria-labelledby="ar-table">
                <CardHeader id="ar-table" title="Month by month" />
                <Table caption={`${year} income and expenses by month`} head={[{ label: 'Month' }, { label: 'Income', right: true }, { label: 'Expenses', right: true }, { label: 'Net', right: true }, { label: 'Savings rate', right: true }]}
                  foot={<tr><td>Total</td><td>{fmt(annual.total.income)}</td><td>{fmt(annual.total.expenses)}</td><td>{fmt(annual.total.net, { signed: annual.total.net < 0 })}</td><td>{formatPct(annual.total.savingsRate)}</td></tr>}>
                  {annual.rows.map((r) => (
                    <tr key={r.month} className={r.hasData ? '' : 'text-muted'}><td>{formatMonthName(r.month)}</td><td>{r.hasData ? fmt(r.income) : '-'}</td><td>{r.hasData ? fmt(r.expenses) : '-'}</td><td className={r.net < 0 ? 'text-peach-deep' : ''}>{r.hasData ? fmt(r.net, { signed: r.net < 0 }) : '-'}</td><td>{r.hasData ? formatPct(r.savingsRate) : '-'}</td></tr>
                  ))}
                </Table>
              </Card>
            </>
          )}

          {tab === 'categories' && (
            <Card aria-labelledby="cr-title">
              <CardHeader id="cr-title" title={`Spending by category · ${year}`} subtitle={`${fmt(annual.categories.reduce((s, r) => s + r.amount, 0))} across ${annual.categories.length} categories`} />
              {annual.categories.length === 0 ? <EmptyState compact title={`No spending in ${year}`} /> : (
                <Table caption={`${year} spending by category`} head={[{ label: 'Category' }, { label: 'Amount', right: true }, { label: 'Share', right: true }, { label: 'Transactions', right: true }, { label: 'Per month', right: true }]}
                  foot={<tr><td>Total</td><td>{fmt(annual.categories.reduce((s, r) => s + r.amount, 0))}</td><td>100%</td><td>{annual.categories.reduce((s, r) => s + r.count, 0)}</td><td>{fmt(Math.round(annual.categories.reduce((s, r) => s + r.amount, 0) / Math.max(1, annual.rows.filter((r) => r.hasData).length)))}</td></tr>}>
                  {annual.categories.map((c) => (
                    <tr key={c.categoryId}><td><CategoryChip category={catMap.get(c.categoryId)} size="sm" /></td><td>{fmt(c.amount)}</td><td>{formatPct(c.pct, 1)}</td><td className="text-muted">{c.count}</td><td className="text-muted">{fmt(Math.round(c.amount / Math.max(1, annual.rows.filter((r) => r.hasData).length)))}</td></tr>
                  ))}
                </Table>
              )}
            </Card>
          )}

          {tab === 'savings' && (
            <>
              <Card aria-labelledby="sr-goals">
                <CardHeader id="sr-goals" title="Savings goals" subtitle="Where each goal stands today" />
                {sav.goals.length === 0 ? <p className="text-sm text-muted">No goals set yet.</p> : (
                  <Table caption="Savings goals progress" head={[{ label: 'Goal' }, { label: 'Saved', right: true }, { label: 'Target', right: true }, { label: 'Progress', right: true }, { label: 'Still needed', right: true }, { label: 'Status', right: true }]}>
                    {sav.goals.map(({ goal, progress: p }) => (
                      <tr key={goal.id}>
                        <td><span aria-hidden>{goal.icon}</span> {goal.name}</td><td>{fmt(p.saved)}</td><td>{fmt(goal.target)}</td><td>{formatPct(p.pct)}</td><td>{fmt(p.remaining)}</td>
                        <td><Badge tone={p.status === 'complete' || p.status === 'on-track' ? 'sage' : p.status === 'behind' ? 'butter' : p.status === 'overdue' ? 'peach' : 'neutral'}>{({ complete: 'Reached', 'on-track': 'On track', behind: 'Behind', overdue: 'Past date', 'no-date': 'No date' } as const)[p.status]}</Badge></td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>
              <Card aria-labelledby="sr-months">
                <CardHeader id="sr-months" title={`Saved each month · ${year}`} subtitle={data.settings.monthlySavingsTarget > 0 ? `Target ${fmt(data.settings.monthlySavingsTarget)} a month` : 'Set a monthly target on the Savings page to track it here'} />
                {sav.months.length === 0 ? <p className="text-sm text-muted">No activity in {year}.</p> : (
                  <Table caption="Left after income and expenses, by month" head={[{ label: 'Month' }, { label: 'Left over', right: true }, { label: 'Target', right: true }]}>
                    {sav.months.map((r) => (
                      <tr key={r.month}><td>{formatMonthName(r.month)}</td><td className={r.net < 0 ? 'text-peach-deep' : ''}>{fmt(r.net, { signed: r.net < 0 })}</td><td>{r.metTarget === null ? <span className="text-muted">-</span> : r.metTarget ? <Badge tone="sage">Met</Badge> : <Badge tone="butter">Missed</Badge>}</td></tr>
                    ))}
                  </Table>
                )}
              </Card>
            </>
          )}

          {tab === 'compare' && (
            <Card aria-labelledby="mom-title">
              <CardHeader id="mom-title" title="Month-over-month" subtitle={`The six months up to ${formatMonthLabel(month)}, each compared with the month before`} />
              <Table caption="Month-over-month comparison" head={[{ label: 'Month' }, { label: 'Income', right: true }, { label: 'vs prev', right: true }, { label: 'Expenses', right: true }, { label: 'vs prev', right: true }, { label: 'Net', right: true }, { label: 'Savings rate', right: true }]}>
                {[...mom].reverse().map((r) => (
                  <tr key={r.month}><td>{formatMonthLabel(r.month)}</td><td>{fmt(r.income)}</td><td><Delta pct={r.incomeChangePct} goodWhen="up" /></td><td>{fmt(r.expenses)}</td><td><Delta pct={r.expenseChangePct} goodWhen="down" /></td><td className={r.net < 0 ? 'text-peach-deep' : ''}>{fmt(r.net, { signed: r.net < 0 })}</td><td>{formatPct(r.savingsRate)}</td></tr>
                ))}
              </Table>
              <p className="mt-3 text-xs text-muted">A dash means the earlier month had nothing to compare against. A month still in progress is shown as it stands so far.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
