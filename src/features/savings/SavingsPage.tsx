import { ArrowRightLeft, CalendarClock, ChevronDown, Equal, Landmark, Minus as MinusIcon, Pencil, PiggyBank, Plus, Target, Trash2, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardHeader, PageHeader } from '../../components/ui/Card';
import { Badge, EmptyState, InfoTip, ProgressBar } from '../../components/ui/Feedback';
import { MoneyInput } from '../../components/ui/Form';
import { goalProgress, goalSaved, goalTransferEffect, accountMap, savingsOverview, savingsTargetStatus, type GoalProgress } from '../../domain/calc';
import { formatDate, formatMonthLabel } from '../../domain/dates';
import { formatPct, minorToInput, parseAmount } from '../../domain/money';
import type { Goal } from '../../domain/types';
import { useMonthData } from '../../hooks/useMonthData';
import { useFeedback } from '../../state/feedback';
import { useMoney, useStore } from '../../state/store';
import { useUi } from '../../state/ui';
import { ContributionModal } from './ContributionModal';
import { GoalModal } from './GoalModal';

const STATUS: Record<GoalProgress['status'], { label: string; tone: 'sage' | 'butter' | 'peach' | 'blue' | 'neutral' }> = {
  complete: { label: 'Reached', tone: 'sage' },
  'on-track': { label: 'On track', tone: 'sage' },
  behind: { label: 'A little behind', tone: 'butter' },
  overdue: { label: 'Past target date', tone: 'peach' },
  'no-date': { label: 'No deadline', tone: 'neutral' },
};

function GoalCard({ goal, onEdit, onContribute }: { goal: Goal; onEdit: () => void; onContribute: (mode: 'add' | 'withdraw') => void }) {
  const { data, today, dispatch } = useStore();
  const { fmt } = useMoney();
  const { confirm, toast } = useFeedback();
  const { openEditTx } = useUi();
  const [open, setOpen] = useState(false);
  const saved = goalSaved(goal, data.goalEntries, data.transactions, data.accounts);
  const p = goalProgress(goal, saved, today);
  const s = STATUS[p.status];

  const history = useMemo(() => {
    const accMap = accountMap(data.accounts);
    const entries = data.goalEntries.filter((e) => e.goalId === goal.id).map((e) => ({ kind: 'entry' as const, id: e.id, date: e.date, amount: e.amount, label: e.note || (e.amount > 0 ? 'Assigned from savings' : 'Released from goal') }));
    const transfers = data.transactions.filter((t) => t.goalId === goal.id).map((t) => ({ kind: 'transfer' as const, id: t.id, date: t.date, amount: goalTransferEffect(t, accMap), label: t.description })).filter((x) => x.amount !== 0);
    return [...entries, ...transfers].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [data, goal.id]);

  const removeEntry = async (id: string) => {
    const ok = await confirm({ title: 'Remove this entry?', tone: 'danger', confirmLabel: 'Remove', message: 'The goal’s saved amount will go back to what it was before this entry.' });
    if (!ok) return;
    dispatch({ type: 'deleteGoalEntry', id });
    toast('Entry removed.');
  };

  return (
    <Card className="flex flex-col !p-0 overflow-hidden" aria-label={goal.name}>
      <div className="h-1.5" style={{ background: goal.color }} aria-hidden />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: `color-mix(in srgb, ${goal.color} 35%, transparent)` }} aria-hidden>{goal.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate font-sans text-base font-semibold text-ink">{goal.name}</h3>
              <IconButton label={`Edit ${goal.name}`} size="sm" onClick={onEdit}><Pencil size={14} /></IconButton>
            </div>
            {goal.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{goal.description}</p>}
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-end justify-between gap-3">
            <p className="font-serif text-3xl leading-none tabular-nums text-ink">{formatPct(p.pct)}</p>
            <Badge tone={s.tone}>{s.label}</Badge>
          </div>
          <ProgressBar pct={p.barPct} color={goal.color} label={`${goal.name} progress`} height="lg" className="mt-3" />
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div><dt className="text-xs text-muted">Saved</dt><dd className="font-medium tabular-nums text-ink">{fmt(p.saved)}</dd></div>
            <div className="text-right"><dt className="text-xs text-muted">Target</dt><dd className="font-medium tabular-nums text-ink">{fmt(goal.target)}</dd></div>
            <div><dt className="text-xs text-muted">{p.status === 'complete' ? 'Over target by' : 'Still needed'}</dt><dd className="font-medium tabular-nums text-ink">{p.status === 'complete' ? fmt(Math.max(0, p.saved - goal.target)) : fmt(p.remaining)}</dd></div>
            <div className="text-right"><dt className="text-xs text-muted">Target date</dt><dd className="font-medium text-ink">{goal.targetDate ? formatDate(goal.targetDate, { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</dd></div>
          </dl>
          {p.requiredMonthly !== null && p.status !== 'complete' && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-surface2 px-3 py-2 text-xs text-muted">
              <CalendarClock size={14} className="mt-px shrink-0" aria-hidden />
              <span>Setting aside about <strong className="text-ink">{fmt(p.requiredMonthly, { trimWhole: true })}</strong> a month gets you there by {formatDate(goal.targetDate!, { month: 'long', year: 'numeric' })}.</span>
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => onContribute('add')}>Add money</Button>
          <Button size="sm" icon={<MinusIcon size={14} />} onClick={() => onContribute('withdraw')} disabled={p.saved <= 0}>Take out</Button>
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="tap ml-auto inline-flex items-center gap-1 text-xs font-medium text-sage-deep hover:underline">
            History ({history.length}) <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {open && (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line text-sm [animation:fade-in_0.15s_ease_both]">
            <li className="flex items-center justify-between px-3 py-2 text-muted"><span>Started with</span><span className="tabular-nums">{fmt(goal.startingAmount)}</span></li>
            {history.map((h) => (
              <li key={`${h.kind}-${h.id}`} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{h.label}</span>
                  <span className="text-xs text-muted">{formatDate(h.date, { day: 'numeric', month: 'short', year: 'numeric' })} · {h.kind === 'transfer' ? 'Transfer' : 'Assigned'}</span>
                </span>
                <span className={`tabular-nums font-medium ${h.amount >= 0 ? 'text-sage-deep' : 'text-peach-deep'}`}>{fmt(h.amount, { signed: true })}</span>
                {h.kind === 'entry' ? (
                  <IconButton label="Remove entry" size="sm" onClick={() => removeEntry(h.id)}><Trash2 size={13} /></IconButton>
                ) : (
                  <IconButton label="Edit transfer" size="sm" onClick={() => openEditTx(h.id)}><Pencil size={13} /></IconButton>
                )}
              </li>
            ))}
            {history.length === 0 && <li className="px-3 py-3 text-center text-xs text-muted">No contributions yet.</li>}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function SavingsPage() {
  const { data, dispatch, today } = useStore();
  const { fmt, currency } = useMoney();
  const { month, openAddTx } = useUi();
  const { toast } = useFeedback();
  const m = useMonthData(month);
  const [goalModal, setGoalModal] = useState<Goal | 'new' | null>(null);
  const [contrib, setContrib] = useState<{ goal: Goal; mode: 'add' | 'withdraw' } | null>(null);
  const [targetDraft, setTargetDraft] = useState<string | null>(null);

  const ov = useMemo(() => savingsOverview(data, month), [data, month]);
  const target = data.settings.monthlySavingsTarget;
  const ts = savingsTargetStatus(ov.netCashFlow, target, month, today);
  const savingsAccounts = data.accounts.filter((a) => a.kind === 'savings');
  const overAllocated = ov.unallocated < 0;

  const saveTarget = () => {
    const v = targetDraft && targetDraft.trim() ? parseAmount(targetDraft, currency) : 0;
    if (v === null || v < 0) return toast('That doesn’t look like an amount.', { kind: 'error' });
    dispatch({ type: 'updateSettings', patch: { monthlySavingsTarget: v } });
    setTargetDraft(null);
    toast(v > 0 ? 'Monthly target saved.' : 'Monthly target cleared.');
  };

  const sortedGoals = useMemo(() => {
    const prog = (g: Goal) => goalProgress(g, goalSaved(g, data.goalEntries, data.transactions, data.accounts), today);
    return [...data.goals].sort((a, b) => Number(prog(a).status === 'complete') - Number(prog(b).status === 'complete') || (prog(b).pct ?? 0) - (prog(a).pct ?? 0));
  }, [data, today]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Savings"
        subtitle="Three different things people call “savings”, kept clearly apart so the numbers always add up."
        actions={
          <>
            <Button icon={<ArrowRightLeft size={15} />} onClick={() => openAddTx({ type: 'transfer', description: 'Transfer to savings', categoryId: 'savings', categorySource: 'rule' })}>Move money to savings</Button>
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setGoalModal('new')}>New goal</Button>
          </>
        }
      />

      <section aria-label="Savings figures" className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="!p-5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-muted"><Wallet size={15} /> Left after income & expenses <InfoTip text={`Income minus expenses for ${formatMonthLabel(month)}. It's what's left over for the month — not necessarily moved into a savings account yet.`} /></div>
          <p className={`mt-2 font-serif text-3xl tabular-nums ${ov.netCashFlow < 0 ? 'text-peach-deep' : 'text-ink'}`}>{fmt(ov.netCashFlow, { signed: ov.netCashFlow < 0 })}</p>
          <p className="mt-1 text-xs text-muted">{formatMonthLabel(month)} · income {fmt(m.summary.income, { trimWhole: true })} − expenses {fmt(m.summary.expenses, { trimWhole: true })}</p>
        </Card>
        <Card className="!p-5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-muted"><Landmark size={15} /> Held in savings accounts <InfoTip text="The money actually sitting in your savings accounts right now: opening balance plus everything you've moved in, minus what you've moved out." /></div>
          <p className="mt-2 font-serif text-3xl tabular-nums text-ink">{fmt(ov.heldInSavings)}</p>
          <p className="mt-1 text-xs text-muted">{savingsAccounts.length === 0 ? 'No savings account yet' : savingsAccounts.map((a) => `${a.name} ${fmt(m.balances.byAccount.get(a.id) ?? 0, { trimWhole: true })}`).join(' · ')}</p>
        </Card>
        <Card className="!p-5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-muted"><Target size={15} /> Assigned to goals <InfoTip text="The part of your savings accounts that you've earmarked for specific goals. Whatever's left over is 'unassigned'." /></div>
          <p className="mt-2 font-serif text-3xl tabular-nums text-ink">{fmt(ov.allocatedToGoals)}</p>
          <p className={`mt-1 text-xs ${overAllocated ? 'font-medium text-peach-deep' : 'text-muted'}`}>{overAllocated ? `Goals add up to ${fmt(-ov.unallocated)} more than your savings accounts hold` : `${fmt(ov.unallocated)} not assigned to a goal`}</p>
        </Card>
      </section>
      <p className="-mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-muted">
        <Equal size={13} aria-hidden />
        <span>Held in savings ({fmt(ov.heldInSavings, { trimWhole: true })}) = assigned to goals ({fmt(ov.allocatedToGoals, { trimWhole: true })}) + unassigned ({fmt(ov.unallocated, { trimWhole: true })})</span>
      </p>
      {overAllocated && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-butter/70 bg-butter-soft px-4 py-3 text-sm text-butter-deep">
          <PiggyBank size={18} className="mt-0.5 shrink-0" />
          <p>Your goals have more assigned than your savings accounts hold. That usually means an opening balance is too low or a transfer hasn’t been recorded. You can add a transfer, or update the savings account’s starting balance in Settings.</p>
        </div>
      )}

      <Card aria-labelledby="target-title">
        <CardHeader id="target-title" title="Monthly savings target" subtitle={`Measured against what's left after income and expenses in ${formatMonthLabel(month)}`} />
        {targetDraft !== null ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56"><MoneyInput value={targetDraft} onChange={setTargetDraft} currency={currency} aria-label="Monthly savings target" data-autofocus autoFocus /></div>
            <Button variant="primary" onClick={saveTarget}>Save</Button>
            <Button variant="ghost" onClick={() => setTargetDraft(null)}>Cancel</Button>
          </div>
        ) : target > 0 ? (
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p><span className="font-serif text-3xl tabular-nums text-ink">{fmt(Math.max(0, ov.netCashFlow))}</span> <span className="text-muted">of {fmt(target)}</span></p>
              <div className="flex items-center gap-2">
                <Badge tone={ts.status === 'met' || ts.status === 'on-track' ? 'sage' : 'butter'}>{ts.status === 'met' ? 'Target reached 🎉' : ts.status === 'on-track' ? 'On track' : 'A little behind'}</Badge>
                <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setTargetDraft(minorToInput(target, currency))}>Edit</Button>
              </div>
            </div>
            <ProgressBar pct={ts.pct ?? 0} color={ts.status === 'behind' ? 'var(--c-butter)' : 'var(--c-sage)'} label="Monthly savings target progress" height="lg" className="mt-3" />
            <p className="mt-2 text-xs text-muted">{ts.status === 'behind' && month === today.slice(0, 7) ? `To be on pace you'd want about ${fmt(Math.round(target * (Number(today.slice(8, 10)) / new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate())), { trimWhole: true })} by today.` : ts.status === 'behind' ? `${fmt(target - Math.max(0, ov.netCashFlow))} short of the target that month.` : ' '}</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-sm text-muted">Optional. Set an amount you’d like to keep each month and we’ll show whether you’re on track.</p>
            <Button icon={<Target size={15} />} onClick={() => setTargetDraft('')}>Set a target</Button>
          </div>
        )}
      </Card>

      <div>
        <h2 className="mb-3 font-serif text-2xl text-ink">Goals</h2>
        {data.goals.length === 0 ? (
          <Card><EmptyState icon={<PiggyBank size={26} />} title="What are you saving for?" action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setGoalModal('new')}>Create your first goal</Button>}>An emergency fund, a holiday, a new laptop. A goal turns “save more” into something you can see growing.</EmptyState></Card>
        ) : (
          <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedGoals.map((g) => (
              <GoalCard key={g.id} goal={g} onEdit={() => setGoalModal(g)} onContribute={(mode) => setContrib({ goal: g, mode })} />
            ))}
          </div>
        )}
      </div>

      {goalModal && <GoalModal goal={goalModal === 'new' ? undefined : goalModal} onClose={() => setGoalModal(null)} />}
      {contrib && <ContributionModal goal={contrib.goal} mode={contrib.mode} onClose={() => setContrib(null)} />}
    </div>
  );
}
