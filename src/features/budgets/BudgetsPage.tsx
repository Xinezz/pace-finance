import { AlertTriangle, CheckCircle2, CircleAlert, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { CategoryIcon } from '../../components/category/CategoryChip';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardHeader, PageHeader } from '../../components/ui/Card';
import { Badge, EmptyState, InfoTip, ProgressBar } from '../../components/ui/Feedback';
import { Field, MoneyInput, Select } from '../../components/ui/Form';
import { Modal } from '../../components/ui/Modal';
import { averageMonthlyByCategory, categoryById, filterPeriod, projectMonthEnd, type BudgetState, type RecurringGroup } from '../../domain/calc';
import { categoriesForType } from '../../domain/categorize';
import { formatMonthLabel, monthRange } from '../../domain/dates';
import { currencyDecimals, formatPct, minorToInput, parseAmount } from '../../domain/money';
import type { Category } from '../../domain/types';
import { useMonthData } from '../../hooks/useMonthData';
import { useFeedback } from '../../state/feedback';
import { useMoney, useStore } from '../../state/store';
import { useUi } from '../../state/ui';

const STATE_UI: Record<Exclude<BudgetState, 'none'>, { color: string; label: string; badge: 'sage' | 'butter' | 'peach'; icon: typeof CheckCircle2 }> = {
  ok: { color: 'var(--c-sage)', label: 'Comfortable', badge: 'sage', icon: CheckCircle2 },
  near: { color: 'var(--c-butter)', label: 'Close to the limit', badge: 'butter', icon: CircleAlert },
  over: { color: 'var(--c-peach)', label: 'Over budget', badge: 'peach', icon: AlertTriangle },
};

/** Round a suggestion up to a tidy figure, e.g. 387.40 -> 400. */
function tidy(minor: number, currency: string): number {
  const unit = 10 ** currencyDecimals(currency);
  const major = minor / unit;
  const step = major >= 1000 ? 50 : major >= 100 ? 10 : 5;
  return Math.ceil(major / step) * step * unit;
}

function BudgetModal({ category, onClose }: { category?: Category; onClose: () => void }) {
  const { data, dispatch, today } = useStore();
  const { currency, fmt } = useMoney();
  const { month } = useUi();
  const { toast } = useFeedback();
  const existing = category ? data.budgets.find((b) => b.categoryId === category.id) : undefined;
  const available = useMemo(() => categoriesForType(data.categories, 'expense').filter((c) => c.id !== 'other' && !data.budgets.some((b) => b.categoryId === c.id)), [data.categories, data.budgets]);
  const [catId, setCatId] = useState(category?.id ?? available[0]?.id ?? '');
  const [amount, setAmount] = useState(existing ? minorToInput(existing.amount, currency) : '');
  const [error, setError] = useState<string | null>(null);
  const avg = useMemo(() => averageMonthlyByCategory(data.transactions, month, today, 6), [data.transactions, month, today]);
  const suggestion = catId ? avg.get(catId) : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = parseAmount(amount, currency);
    if (!catId) return setError('Choose a category.');
    if (v === null || v <= 0) return setError('Enter a budget larger than zero.');
    dispatch({ type: 'setBudget', categoryId: catId, amount: v });
    toast(existing ? 'Budget updated.' : 'Budget added.');
    onClose();
  };

  const cat = category ?? data.categories.find((c) => c.id === catId);
  return (
    <Modal title={existing ? `Edit ${cat?.name} budget` : 'Add a budget'} description="This is a limit per month. It applies to every month, so editing it changes past months’ progress too." onClose={onClose} width="28rem">
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        {!category && (
          <Field label="Category" required>
            <Select value={catId} onChange={(e) => setCatId(e.target.value)}>
              {available.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Monthly budget" required error={error}>
          <MoneyInput value={amount} onChange={(v) => { setAmount(v); setError(null); }} currency={currency} data-autofocus />
        </Field>
        {suggestion !== undefined && suggestion > 0 && (
          <button type="button" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-sage-soft px-3 py-2.5 text-left text-sm text-sage-deep transition-colors hover:bg-sage/30" onClick={() => setAmount(minorToInput(tidy(suggestion, currency), currency))}>
            <span className="min-w-0 flex-[1_1_12rem]">You usually spend about <strong>{fmt(suggestion, { trimWhole: true })}</strong> a month here.</span>
            <span className="shrink-0 whitespace-nowrap font-semibold">Use {fmt(tidy(suggestion, currency), { trimWhole: true })}</span>
          </button>
        )}
        <div className="flex justify-between gap-2">
          {existing ? (
            <Button variant="danger" icon={<Trash2 size={14} />} onClick={() => { dispatch({ type: 'setBudget', categoryId: existing.categoryId, amount: 0 }); toast('Budget removed.'); onClose(); }}>Remove</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!catId}>{existing ? 'Save' : 'Add budget'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function BudgetsPage() {
  const { data, today } = useStore();
  const { fmt } = useMoney();
  const { month } = useUi();
  const m = useMonthData(month);
  const catMap = useMemo(() => categoryById(data.categories), [data.categories]);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);

  const budgetedIds = useMemo(() => new Set(m.budgets.rows.map((r) => r.categoryId)), [m.budgets.rows]);

  // Projection for the budgeted categories only, so it can be compared with the total budget.
  const projectionFor = (ids: Set<string>, recurring: RecurringGroup[]) => {
    const txs = data.transactions.filter((t) => t.type !== 'expense' || ids.has(t.categoryId));
    return projectMonthEnd(txs, month, today, recurring.filter((g) => ids.has(g.categoryId)));
  };
  const overallProjection = useMemo(() => projectionFor(budgetedIds, m.recurring), [data.transactions, month, today, budgetedIds, m.recurring]); // eslint-disable-line react-hooks/exhaustive-deps

  const catProjection = (id: string) => projectionFor(new Set([id]), m.recurring);

  const unbudgeted = useMemo(() => {
    const spend = new Map<string, number>();
    for (const t of filterPeriod(data.transactions, monthRange(month).from, monthRange(month).to)) if (t.type === 'expense' && !budgetedIds.has(t.categoryId)) spend.set(t.categoryId, (spend.get(t.categoryId) ?? 0) + (t.refund ? -t.amount : t.amount));
    return [...spend.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [data.transactions, month, budgetedIds]);

  const warnings = m.budgets.rows.filter((r) => r.state === 'near' || r.state === 'over').sort((a, b) => (b.usedPct ?? 0) - (a.usedPct ?? 0));
  const overall = m.budgets.overall;
  const ui = overall.state === 'none' ? null : STATE_UI[overall.state];
  const rows = [...m.budgets.rows].sort((a, b) => (b.usedPct ?? 0) - (a.usedPct ?? 0));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Budgets" subtitle={`Monthly spending limits · ${formatMonthLabel(month)}`} actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>Add budget</Button>} />

      {m.budgets.rows.length === 0 ? (
        <Card>
          <EmptyState icon={<Target size={26} />} title="No budgets yet" action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>Set your first budget</Button>}>
            Pick a category like Food or Transport and give it a monthly limit. We’ll gently let you know as you get close.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div role="region" aria-label="Budget warnings" aria-live="polite" className="flex flex-col gap-2 empty:hidden">
            {warnings.map((r) => {
              const c = catMap.get(r.categoryId);
              const over = r.state === 'over';
              return (
                <div key={r.categoryId} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${over ? 'border-peach/60 bg-peach-soft text-peach-deep' : 'border-butter/70 bg-butter-soft text-butter-deep'}`}>
                  {over ? <AlertTriangle size={18} /> : <CircleAlert size={18} />}
                  <p>
                    <strong className="font-semibold">{c?.icon} {c?.name}</strong>{' '}
                    {over ? `has gone over budget by ${fmt(-r.remaining)}.` : `has used ${formatPct(r.usedPct)} of its budget, with ${fmt(r.remaining)} left.`}
                  </p>
                </div>
              );
            })}
          </div>

          <Card aria-labelledby="overall-title">
            <CardHeader id="overall-title" title="Overall" subtitle="Across the categories you’ve set a budget for" action={ui && <Badge tone={ui.badge}><ui.icon size={12} /> {ui.label}</Badge>} />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="md:col-span-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-serif text-4xl tabular-nums text-ink">{fmt(overall.spent)}</span>
                  <span className="text-muted">of {fmt(overall.budget)} budgeted</span>
                </div>
                <ProgressBar pct={overall.usedPct ?? 0} color={ui?.color} label="Overall budget used" height="lg" className="mt-3" />
                <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm text-muted">
                  <span>{formatPct(overall.usedPct)} used</span>
                  <span className={overall.remaining < 0 ? 'font-medium text-peach-deep' : ''}>{overall.remaining >= 0 ? `${fmt(overall.remaining)} left` : `${fmt(-overall.remaining)} over`}</span>
                </div>
                {m.budgets.unbudgetedSpent > 0 && <p className="mt-3 text-xs text-muted">Plus {fmt(m.budgets.unbudgetedSpent)} in categories without a budget (not counted above).</p>}
              </div>
              <div className="rounded-2xl bg-surface2 p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                  Projected by month end
                  <Badge tone="blue">Estimate</Badge>
                </p>
                {overallProjection.kind === 'estimate' ? (
                  <>
                    <p className="mt-2 font-serif text-3xl tabular-nums text-ink">{fmt(overallProjection.amount)}</p>
                    <p className={`mt-1 text-sm ${overallProjection.amount > overall.budget ? 'text-peach-deep' : 'text-sage-deep'}`}>
                      {overallProjection.amount > overall.budget ? `About ${fmt(overallProjection.amount - overall.budget)} over budget` : `About ${fmt(overall.budget - overallProjection.amount)} under budget`}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted">Based on {overallProjection.daysElapsed} days of spending. Regular bills count as they land; everyday spending is extended at your current daily pace. <InfoTip text="This is a rough guide, not a promise. A big one-off purchase or a quiet week will change it." /></p>
                  </>
                ) : overallProjection.kind === 'final' ? (
                  <p className="mt-2 text-sm text-muted">This month is complete, so {fmt(overallProjection.amount)} is the final figure.</p>
                ) : overallProjection.kind === 'too-early' ? (
                  <p className="mt-2 text-sm text-muted">Too early to estimate. Check back after a few days of spending.</p>
                ) : (
                  <p className="mt-2 text-sm text-muted">Projections are only shown for the current month.</p>
                )}
              </div>
            </div>
          </Card>

          <section aria-label="Category budgets" className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {rows.map((r) => {
              const c = catMap.get(r.categoryId);
              if (!c || r.state === 'none') return null;
              const s = STATE_UI[r.state];
              const proj = catProjection(r.categoryId);
              const willExceed = proj.kind === 'estimate' && proj.amount > r.budget && r.state !== 'over';
              return (
                <Card key={r.categoryId} className="!p-5">
                  <div className="flex items-start gap-3">
                    <CategoryIcon category={c} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate font-sans text-base font-semibold text-ink">{c.name}</h3>
                          <p className="text-sm tabular-nums text-muted"><span className="font-medium text-ink">{fmt(r.spent)}</span> of {fmt(r.budget)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge tone={s.badge}><s.icon size={11} /> {s.label}</Badge>
                          <IconButton label={`Edit ${c.name} budget`} size="sm" onClick={() => setEditing(c)}><Pencil size={14} /></IconButton>
                        </div>
                      </div>
                      <ProgressBar pct={r.usedPct ?? 0} color={s.color} label={`${c.name} budget used`} className="mt-3" />
                      <div className="mt-2 flex justify-between text-sm">
                        <span className="tabular-nums text-muted">{formatPct(r.usedPct)} used</span>
                        <span className={`tabular-nums ${r.remaining < 0 ? 'font-medium text-peach-deep' : 'text-muted'}`}>{r.remaining >= 0 ? `${fmt(r.remaining)} left` : `${fmt(-r.remaining)} over`}</span>
                      </div>
                      {willExceed && <p className="mt-2 flex items-center gap-1.5 text-xs text-butter-deep"><CircleAlert size={12} /> On pace to reach about {fmt(proj.amount, { trimWhole: true })} (estimate)</p>}
                    </div>
                  </div>
                </Card>
              );
            })}
          </section>
        </>
      )}

      {unbudgeted.length > 0 && (
        <Card aria-labelledby="unb-title">
          <CardHeader id="unb-title" title="Spending without a budget" subtitle="Categories you spent in this month that have no limit yet" />
          <ul className="divide-y divide-line">
            {unbudgeted.map(([id, amount]) => {
              const c = catMap.get(id);
              const isOther = id === 'other';
              return (
                <li key={id} className="flex items-center gap-3 py-2.5">
                  <CategoryIcon category={c} size={34} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{c?.name ?? 'Uncategorized'}</span>
                  <span className="text-sm tabular-nums text-ink">{fmt(amount)}</span>
                  {!isOther && c && <Button size="sm" variant="soft" onClick={() => setEditing(c)}>Set budget</Button>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {editing && <BudgetModal category={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

