import { Flame, Plus, Repeat } from 'lucide-react';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { CategoryIcon } from '../../components/category/CategoryChip';
import { TransactionRow } from '../../components/transactions/TransactionRow';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, PageHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/Feedback';
import { categoryById, dailyTotals, unusualDays } from '../../domain/calc';
import { addDays, daysInMonth, formatDate, formatDayHeading, formatMonthLabel, monthKeyOf, parseDateStr, weekStartOf, weekdayLabels } from '../../domain/dates';
import { useMonthData } from '../../hooks/useMonthData';
import { useMoney, useStore } from '../../state/store';
import { useUi } from '../../state/ui';

export function CalendarPage() {
  const { data, today } = useStore();
  const { fmt } = useMoney();
  const { month, openAddTx, navigate } = useUi();
  const m = useMonthData(month);
  const catMap = useMemo(() => categoryById(data.categories), [data.categories]);
  const [selected, setSelected] = useState<string>(() => (monthKeyOf(today) === month ? today : `${month}-01`));
  const [showAllTimeline, setShowAllTimeline] = useState(false);

  // Keep the selection inside the month being viewed.
  useEffect(() => {
    setSelected((s) => (monthKeyOf(s) === month ? s : monthKeyOf(today) === month ? today : `${month}-01`));
  }, [month, today]);

  const totals = useMemo(() => dailyTotals(m.monthTxs), [m.monthTxs]);
  const unusual = useMemo(() => unusualDays(m.monthTxs, m.recurring), [m.monthTxs, m.recurring]);
  const recurringIds = useMemo(() => new Set(m.recurring.flatMap((g) => g.txIds)), [m.recurring]);
  const maxSpend = useMemo(() => Math.max(1, ...[...totals.values()].map((d) => d.expenses)), [totals]);

  const weekStartsOn = data.settings.weekStartsOn;
  const dim = daysInMonth(month);
  const firstOfMonth = `${month}-01`;
  const gridStart = weekStartOf(firstOfMonth, weekStartsOn);
  const cells = useMemo(() => {
    const lead = Math.round((parseDateStr(firstOfMonth).getTime() - parseDateStr(gridStart).getTime()) / 86_400_000);
    const total = Math.ceil((lead + dim) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const date = addDays(gridStart, i);
      return { date, inMonth: monthKeyOf(date) === month };
    });
  }, [gridStart, firstOfMonth, dim, month]);

  const dayTxs = useMemo(() => m.monthTxs.filter((t) => t.date === selected).sort((a, b) => b.createdAt - a.createdAt), [m.monthTxs, selected]);
  const dayTotals = totals.get(selected);

  const spendingDays = [...totals.entries()].filter(([, d]) => d.expenses > 0);
  const busiest = spendingDays.sort((a, b) => b[1].expenses - a[1].expenses)[0];
  const elapsed = monthKeyOf(today) === month ? Number(today.slice(8, 10)) : monthKeyOf(today) > month ? dim : 0;
  const avgDaily = elapsed > 0 ? Math.round(m.summary.expenses / elapsed) : null;

  const timeline = useMemo(() => {
    const groups = new Map<string, typeof m.monthTxs>();
    for (const t of [...m.monthTxs].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))) {
      const g = groups.get(t.date);
      if (g) g.push(t);
      else groups.set(t.date, [t]);
    }
    return [...groups.entries()];
  }, [m]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? 7 : e.key === 'ArrowUp' ? -7 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = addDays(date, delta);
    if (monthKeyOf(next) !== month) return;
    setSelected(next);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus());
  };

  const labels = weekdayLabels(weekStartsOn);

  if (data.transactions.length === 0) {
    return (
      <>
        <PageHeader title="Calendar" subtitle="Explore your spending day by day." />
        <Card><EmptyState title="Your calendar is empty" action={<Button variant="primary" onClick={() => openAddTx()}>Add a transaction</Button>}>Each day will show what came in and what went out.</EmptyState></Card>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Calendar" subtitle={`${formatMonthLabel(month)} · click a day to see what happened`} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="!p-3 sm:!p-5" aria-label={`Calendar for ${formatMonthLabel(month)}`}>
            <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-1.5" aria-hidden>
              {labels.map((l) => <div key={l} className="py-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted">{l.slice(0, 3)}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label="Days of the month">
              {cells.map(({ date, inMonth }) => {
                if (!inMonth) return <div key={date} className="min-h-14 rounded-xl sm:min-h-[5.25rem]" aria-hidden />;
                const d = totals.get(date);
                const heat = d && d.expenses > 0 ? 0.1 + 0.5 * (d.expenses / maxSpend) : 0;
                const isToday = date === today;
                const isSel = date === selected;
                const odd = unusual.has(date);
                const hasRecurring = m.monthTxs.some((t) => t.date === date && recurringIds.has(t.id));
                const dayNum = Number(date.slice(8, 10));
                const label = `${formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}${d ? `: ${d.expenses ? `spent ${fmt(d.expenses)}` : ''}${d.income ? `${d.expenses ? ', ' : ''}received ${fmt(d.income)}` : ''}, ${d.count} transaction${d.count === 1 ? '' : 's'}` : ': no transactions'}${odd ? '. Higher than usual spending' : ''}`;
                return (
                  <button
                    key={date}
                    type="button"
                    role="gridcell"
                    data-day={date}
                    aria-label={label}
                    aria-selected={isSel}
                    aria-current={isToday ? 'date' : undefined}
                    tabIndex={isSel ? 0 : -1}
                    onClick={() => setSelected(date)}
                    onKeyDown={(e) => onKey(e, date)}
                    className={`relative flex min-h-14 flex-col items-stretch rounded-xl border p-1 text-left transition-all sm:min-h-[5.25rem] sm:p-2 ${isSel ? 'border-ink shadow-[var(--shadow-card)]' : 'border-line hover:border-line2'} ${isToday ? 'ring-2 ring-sage-deep/60 ring-offset-1 ring-offset-surface' : ''}`}
                    style={{ background: heat ? `color-mix(in srgb, var(--c-peach) ${Math.round(heat * 100)}%, var(--c-surface))` : 'var(--c-surface)' }}
                  >
                    <span className="flex items-center justify-between">
                      <span className={`text-xs font-semibold tabular-nums sm:text-sm ${isToday ? 'grid h-5 w-5 place-items-center rounded-full bg-primary text-on-primary sm:h-6 sm:w-6' : 'text-ink'}`}>{dayNum}</span>
                      <span className="flex items-center gap-0.5 text-peach-deep">
                        {odd && <Flame size={12} aria-hidden />}
                        {hasRecurring && <Repeat size={11} className="text-blue-deep" aria-hidden />}
                      </span>
                    </span>
                    {d && (
                      <span className="mt-auto hidden flex-col text-[10px] leading-tight tabular-nums sm:flex sm:text-[11px]">
                        {d.income > 0 && <span className="truncate font-medium text-sage-deep">+{fmt(d.income, { compact: true })}</span>}
                        {d.expenses > 0 && <span className="truncate font-medium text-ink">-{fmt(d.expenses, { compact: true })}</span>}
                      </span>
                    )}
                    {d && (
                      <span className="mt-auto flex gap-0.5 sm:hidden" aria-hidden>
                        {d.income > 0 && <span className="h-1.5 w-1.5 rounded-full bg-sage-deep" />}
                        {d.expenses > 0 && <span className="h-1.5 w-1.5 rounded-full bg-peach-deep" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-peach/60" aria-hidden /> Darker = more spent</li>
              <li className="flex items-center gap-1.5"><Flame size={12} className="text-peach-deep" aria-hidden /> Higher than usual</li>
              <li className="flex items-center gap-1.5"><Repeat size={12} className="text-blue-deep" aria-hidden /> Includes a recurring bill</li>
              <li className="flex items-center gap-1.5"><span className="font-medium text-sage-deep">+</span> income</li>
            </ul>
          </Card>

          <Card aria-labelledby="timeline-title">
            <CardHeader id="timeline-title" title="Activity timeline" subtitle={`Everything recorded in ${formatMonthLabel(month)}, newest first`} />
            {timeline.length === 0 ? (
              <EmptyState compact title="Nothing this month yet">Transactions will appear here as a timeline.</EmptyState>
            ) : (
              <ol className="relative ml-2 border-l border-line pl-5">
                {(showAllTimeline ? timeline : timeline.slice(0, 6)).map(([date, list]) => {
                  const day = totals.get(date);
                  return (
                    <li key={date} className="relative pb-5 last:pb-0">
                      <span className="absolute -left-[1.62rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-sage-deep" aria-hidden />
                      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                        <button type="button" onClick={() => setSelected(date)} className="text-sm font-semibold text-ink hover:underline">{formatDayHeading(date, today)}</button>
                        <span className="text-xs tabular-nums text-muted">{day && day.expenses > 0 ? `spent ${fmt(day.expenses)}` : ''}{day && day.income > 0 ? ` · received ${fmt(day.income)}` : ''}</span>
                      </div>
                      <div className="-mx-2">{list.map((t) => <TransactionRow key={t.id} tx={t} category={catMap.get(t.categoryId)} accounts={data.accounts} showDate={false} />)}</div>
                    </li>
                  );
                })}
              </ol>
            )}
            {timeline.length > 6 && (
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShowAllTimeline((s) => !s)}>{showAllTimeline ? 'Show less' : `Show all ${timeline.length} days`}</Button>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card aria-labelledby="day-title" className="lg:sticky lg:top-20">
            <CardHeader
              id="day-title"
              title={formatDayHeading(selected, today)}
              subtitle={formatDate(selected, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              action={<Button size="sm" variant="soft" icon={<Plus size={14} />} onClick={() => openAddTx({ date: selected })}>Add</Button>}
            />
            {dayTotals ? (
              <div className="mb-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-sage-soft px-3 py-2"><p className="text-xs text-sage-deep">In</p><p className="font-semibold tabular-nums text-sage-deep">{fmt(dayTotals.income)}</p></div>
                <div className="rounded-xl bg-peach-soft px-3 py-2"><p className="text-xs text-peach-deep">Out</p><p className="font-semibold tabular-nums text-peach-deep">{fmt(dayTotals.expenses)}</p></div>
              </div>
            ) : null}
            {unusual.has(selected) && <p className="mb-3 flex items-center gap-2 rounded-xl bg-peach-soft px-3 py-2 text-xs text-peach-deep"><Flame size={14} aria-hidden /> A bigger spending day than usual for {formatMonthLabel(month)}.</p>}
            {dayTxs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Nothing recorded on this day.</p>
            ) : (
              <div className="-mx-2 max-h-[28rem] overflow-y-auto">{dayTxs.map((t) => <TransactionRow key={t.id} tx={t} category={catMap.get(t.categoryId)} accounts={data.accounts} showDate={false} compact />)}</div>
            )}
          </Card>

          <Card aria-labelledby="glance-title">
            <CardHeader id="glance-title" title="Month at a glance" />
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted">Spent</dt><dd className="font-semibold tabular-nums text-ink">{fmt(m.summary.expenses)}</dd></div>
              <div><dt className="text-xs text-muted">Received</dt><dd className="font-semibold tabular-nums text-sage-deep">{fmt(m.summary.income)}</dd></div>
              <div><dt className="text-xs text-muted">Daily average</dt><dd className="font-semibold tabular-nums text-ink">{avgDaily === null ? '-' : fmt(avgDaily)}</dd></div>
              <div><dt className="text-xs text-muted">Busiest day</dt><dd className="font-semibold text-ink">{busiest ? <button type="button" className="hover:underline" onClick={() => setSelected(busiest[0])}>{formatDate(busiest[0], { day: 'numeric', month: 'short' })} · {fmt(busiest[1].expenses, { trimWhole: true })}</button> : '-'}</dd></div>
            </dl>
            {unusual.size > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted"><Flame size={12} className="text-peach-deep" aria-hidden /> Higher-than-usual days</p>
                <div className="flex flex-wrap gap-1.5">{[...unusual].sort().map((d) => <button key={d} type="button" onClick={() => setSelected(d)} className="rounded-full bg-peach-soft px-2.5 py-1 text-xs font-medium text-peach-deep hover:brightness-95">{formatDate(d, { day: 'numeric', month: 'short' })}</button>)}</div>
              </div>
            )}
          </Card>

          <Card aria-labelledby="rec-title">
            <CardHeader id="rec-title" icon={<Repeat size={16} />} title="Recurring patterns" subtitle="Spending that repeats like a bill" />
            {m.recurring.length === 0 ? (
              <p className="text-sm text-muted">Once something shows up in three different months, it’ll be listed here.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {m.recurring.slice(0, 8).map((g) => (
                  <li key={g.key} className="flex items-center gap-3">
                    <CategoryIcon category={catMap.get(g.categoryId)} size={34} />
                    <div className="min-w-0 flex-1">
                      <button type="button" className="block max-w-full truncate text-left text-sm font-medium text-ink hover:underline" onClick={() => navigate(`/transactions?q=${encodeURIComponent(g.label)}&period=all`)}>{g.label}</button>
                      <p className="text-xs text-muted">around the {g.typicalDay}{ordinal(g.typicalDay)} · {g.months} months</p>
                    </div>
                    <span className="text-sm tabular-nums text-ink">{fmt(g.typicalAmount, { trimWhole: true })}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
}
