import { ArrowRight, Landmark, Lightbulb, Percent, PiggyBank, Plus, ReceiptText, TrendingDown, TrendingUp, Upload } from 'lucide-react';
import { useMemo } from 'react';
import { greeting } from '../../components/layout/nav';
import { StatCard, DeltaNote } from '../../components/StatCard';
import { CategoryIcon } from '../../components/category/CategoryChip';
import { IncomeExpenseChart } from '../../components/charts/charts';
import { NeedsAttention } from '../../components/transactions/NeedsAttention';
import { TransactionRow } from '../../components/transactions/TransactionRow';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState, ProgressBar } from '../../components/ui/Feedback';
import { buildBuckets, categoryById, goalProgress, goalSaved, savingsTargetStatus } from '../../domain/calc';
import { formatMonthLabel, monthKeyOf } from '../../domain/dates';
import { generateInsights, type Insight } from '../../domain/insights';
import { formatPct } from '../../domain/money';
import { useMonthData } from '../../hooks/useMonthData';
import { useMoney, useStore } from '../../state/store';
import { useUi } from '../../state/ui';

const INSIGHT_STYLE: Record<Insight['tone'], string> = {
  good: 'bg-sage-soft text-sage-deep',
  neutral: 'bg-blue-soft text-blue-deep',
  attention: 'bg-peach-soft text-peach-deep',
};

export function DashboardPage() {
  const { data, today, storeKind } = useStore();
  const { fmt } = useMoney();
  const { month, navigate, openAddTx } = useUi();
  const m = useMonthData(month);
  const catMap = useMemo(() => categoryById(data.categories), [data.categories]);

  const insights = useMemo(() => generateInsights(data, month, today).slice(0, 5), [data, month, today]);
  const buckets = useMemo(() => buildBuckets(data, 'month', 6, today, data.settings.weekStartsOn, { minKeep: 3 }), [data, today]);
  const recent = useMemo(
    () => [...data.transactions].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)).slice(0, 6),
    [data.transactions],
  );
  const goals = useMemo(
    () =>
      data.goals
        .map((g) => ({ g, p: goalProgress(g, goalSaved(g, data.goalEntries, data.transactions, data.accounts), today) }))
        .sort((a, b) => Number(a.p.status === 'complete') - Number(b.p.status === 'complete') || (b.p.pct ?? 0) - (a.p.pct ?? 0))
        .slice(0, 3),
    [data, today],
  );

  const isCurrent = month === monthKeyOf(today);
  const hasAnyTx = data.transactions.length > 0;
  const topCats = m.breakdown.rows.slice(0, 5);
  const target = data.settings.monthlySavingsTarget;
  const targetStatus = savingsTargetStatus(m.summary.net, target, month, today);
  const prevRate = m.previous.savingsRate;

  if (!hasAnyTx) {
    return (
      <div className="stagger flex flex-col gap-6">
        <div>
          <p className="text-sm text-muted">{greeting(data.settings.userName)}</p>
          <h1 className="font-serif text-4xl text-ink sm:text-5xl">Your money, your pace.</h1>
        </div>
        <Card>
          <EmptyState
            title="Your dashboard is ready for its first entry"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => openAddTx()}>
                  Add a transaction
                </Button>
                <Button icon={<Upload size={16} />} onClick={() => navigate('/settings?section=import')}>
                  Import from CSV
                </Button>
              </div>
            }
          >
            Add what you’ve spent or earned and this page fills in with totals, charts and gentle insights. {storeKind === 'cloud' ? 'It’s saved to your own account, which only you can read.' : 'Nothing is shared. It all stays on this device.'}
          </EmptyState>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{greeting(data.settings.userName)}</p>
          <h1 className="font-serif text-4xl font-medium leading-tight text-ink sm:text-5xl">Your money, your pace.</h1>
          <p className="mt-1 text-sm text-muted">
            {formatMonthLabel(month)}
            {isCurrent ? ' · so far this month' : ''}
          </p>
        </div>
        {data.quickActions.length > 0 && (
          <div className="flex max-w-full flex-wrap items-center gap-1.5" role="group" aria-label="Quick add">
            <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted">Quick add</span>
            {data.quickActions.slice(0, 5).map((q) => (
              <button key={q.id} type="button" onClick={() => openAddTx({ type: q.type, description: q.description, amount: q.amount, categoryId: q.categoryId, categorySource: q.type === 'transfer' ? 'rule' : 'manual', paymentMethod: q.paymentMethod })} className="inline-flex items-center gap-1.5 rounded-full border border-line2 bg-surface px-3 py-1.5 text-[13px] text-body transition-all hover:-translate-y-0.5 hover:border-sage-deep hover:bg-sage-soft">
                <span aria-hidden>{q.emoji}</span>
                {q.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <section aria-label="Summary" className="stagger grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <StatCard
          hero
          className="col-span-2 md:col-span-4 lg:col-span-1"
          label="Total balance"
          accent="ink"
          icon={<Landmark size={16} />}
          tip="Everything you have right now: your opening balances plus every transaction you've recorded. This is a snapshot of today, not of the month selected."
          value={fmt(m.balances.total)}
        >
          <span className="block">Spending {fmt(m.balances.spending, { trimWhole: true })}</span>
          <span className="block">Savings {fmt(m.balances.savings, { trimWhole: true })}</span>
        </StatCard>
        <StatCard label="Total income" accent="sage" icon={<TrendingUp size={16} />} tip="Money received during the selected month. Transfers between your own accounts aren't income." value={fmt(m.summary.income)}>
          <DeltaNote current={m.current.income} previous={m.previous.income} goodWhen="up" label={m.cmp.previousLabel} />
        </StatCard>
        <StatCard label="Total expenses" accent="peach" icon={<TrendingDown size={16} />} tip="Money spent during the selected month, minus any refunds. Savings transfers aren't expenses." value={fmt(m.summary.expenses)}>
          <DeltaNote current={m.current.expenses} previous={m.previous.expenses} goodWhen="down" label={m.cmp.previousLabel} />
        </StatCard>
        <StatCard label="Total savings" accent="butter" icon={<PiggyBank size={16} />} tip="Income minus expenses for the month: what's left over. Money held in savings accounts is shown underneath." value={fmt(m.summary.net, { signed: m.summary.net < 0 })}>
          <span className="block">In savings accounts: {fmt(m.balances.savings, { trimWhole: true })}</span>
          {m.summary.movedToSavings !== 0 && <span className="block">Moved this month: {fmt(m.summary.movedToSavings, { trimWhole: true })}</span>}
        </StatCard>
        <StatCard label="Savings rate" accent="blue" icon={<Percent size={16} />} tip="The share of your income left after expenses: (income − expenses) ÷ income." value={m.summary.savingsRate === null ? '-' : formatPct(m.summary.savingsRate)}>
          {m.summary.savingsRate === null ? (
            <span>Add income to see your rate</span>
          ) : prevRate !== null ? (
            <span>
              {formatPct(prevRate)} {m.cmp.partial ? 'at this point last month' : 'last month'}
            </span>
          ) : (
            <span>No rate for last month</span>
          )}
          {target > 0 && (
            <span className="mt-1 block">
              Target {fmt(target, { trimWhole: true })} ·{' '}
              <span className={targetStatus.status === 'behind' ? 'font-medium text-peach-deep' : 'font-medium text-sage-deep'}>
                {targetStatus.status === 'met' ? 'reached' : targetStatus.status === 'on-track' ? 'on track' : 'behind'}
              </span>
            </span>
          )}
        </StatCard>
      </section>

      <NeedsAttention hideWhenEmpty />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="where-title">
          <CardHeader
            id="where-title"
            title="Where your money went"
            subtitle={m.breakdown.total > 0 ? `${fmt(m.breakdown.total)} across ${m.breakdown.rows.length} categor${m.breakdown.rows.length === 1 ? 'y' : 'ies'}` : undefined}
            action={
              <Button size="sm" variant="ghost" onClick={() => navigate('/analytics')}>
                Full analytics <ArrowRight size={14} />
              </Button>
            }
          />
          {topCats.length === 0 ? (
            <EmptyState compact title="No spending yet this month">When you record an expense, you’ll see exactly where it went.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-3.5">
              {topCats.map((r) => {
                const c = catMap.get(r.categoryId);
                return (
                  <li key={r.categoryId}>
                    <button type="button" className="group flex w-full items-center gap-3 text-left" onClick={() => navigate(`/transactions?category=${r.categoryId}&month=${month}`)}>
                      <CategoryIcon category={c} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm font-medium text-ink group-hover:underline">{c?.name ?? 'Uncategorized'}</span>
                          <span className="shrink-0 text-sm tabular-nums text-ink">
                            {fmt(r.amount)} <span className="text-muted">· {formatPct(r.pct)}</span>
                          </span>
                        </span>
                        <ProgressBar pct={r.pct} color={c?.color} label={`${c?.name} share of spending`} height="sm" className="mt-1.5" />
                      </span>
                    </button>
                  </li>
                );
              })}
              {m.breakdown.rows.length > topCats.length && <li className="pl-[3.25rem] text-xs text-muted">+ {m.breakdown.rows.length - topCats.length} more categories</li>}
              {m.breakdown.hasNegative && <li className="pl-[3.25rem] text-xs text-muted">Refunds of {fmt(-m.breakdown.negativeTotal)} are netted off your total expenses.</li>}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="insights-title">
          <CardHeader id="insights-title" title="Insights" icon={<Lightbulb size={17} />} subtitle="Worked out from your own numbers" />
          {insights.length === 0 ? (
            <p className="text-sm text-muted">Insights appear once you have a little activity.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {insights.map((i) => (
                <li key={i.id} className="flex items-start gap-3">
                  <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${INSIGHT_STYLE[i.tone]}`} aria-hidden>
                    {i.tone === 'good' ? '✓' : i.tone === 'attention' ? '!' : 'i'}
                  </span>
                  <p className="text-sm leading-snug text-body">
                    {i.text}
                    {i.link && (
                      <button type="button" className="tap ml-1.5 font-medium text-sage-deep hover:underline" onClick={() => navigate(i.link!.to)}>
                        {i.link.label} →
                      </button>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3" aria-labelledby="flow-title">
          <CardHeader id="flow-title" title="Income vs expenses" subtitle="The last six months" />
          {buckets.every((b) => b.income === 0 && b.expenses === 0) ? <EmptyState compact title="Nothing to chart yet">Record a few transactions across a couple of months and this fills in.</EmptyState> : <IncomeExpenseChart buckets={buckets} height={260} />}
        </Card>

        <Card className="lg:col-span-2" aria-labelledby="goals-title">
          <CardHeader id="goals-title" title="Savings goals" action={<Button size="sm" variant="ghost" onClick={() => navigate('/savings')}>All goals <ArrowRight size={14} /></Button>} />
          {goals.length === 0 ? (
            <EmptyState compact title="No goals yet" action={<Button size="sm" variant="soft" onClick={() => navigate('/savings')}>Set a goal</Button>}>
              A goal gives your savings a purpose.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-4">
              {goals.map(({ g, p }) => (
                <li key={g.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink">
                      <span aria-hidden>{g.icon}</span>
                      <span className="truncate">{g.name}</span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-ink">{formatPct(p.pct)}</span>
                  </div>
                  <ProgressBar pct={p.barPct} color={g.color} label={`${g.name} progress`} />
                  <p className="mt-1 text-xs text-muted">
                    {fmt(p.saved, { trimWhole: true })} of {fmt(g.target, { trimWhole: true })}
                    {p.status === 'complete' ? ' · reached 🎉' : ` · ${fmt(p.remaining, { trimWhole: true })} to go`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card aria-labelledby="recent-title">
        <CardHeader id="recent-title" title="Recent activity" icon={<ReceiptText size={17} />} action={<Button size="sm" variant="ghost" onClick={() => navigate('/transactions')}>View all <ArrowRight size={14} /></Button>} />
        <div className="-mx-2 flex flex-col">
          {recent.map((t) => (
            <TransactionRow key={t.id} tx={t} category={catMap.get(t.categoryId)} accounts={data.accounts} />
          ))}
        </div>
      </Card>
    </div>
  );
}
