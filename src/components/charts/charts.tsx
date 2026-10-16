import { useEffect, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Sector, Tooltip, XAxis, YAxis } from 'recharts';
import type { Bucket } from '../../domain/calc';
import { formatMoney, formatPct } from '../../domain/money';
import { useMoney } from '../../state/store';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

const AXIS = { fill: 'var(--c-muted)', fontSize: 12 } as const;

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

interface TipRow {
  color: string;
  label: string;
  value: string;
  strong?: boolean;
}

function TipCard({ title, rows, footer }: { title?: string; rows: TipRow[]; footer?: ReactNode }) {
  return (
    <div className="min-w-40 rounded-xl border border-line bg-surface px-3 py-2.5 text-xs shadow-[var(--shadow-pop)]">
      {title && <p className="mb-1.5 font-semibold text-ink">{title}</p>}
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: r.color }} aria-hidden />
              {r.label}
            </span>
            <span className={`tabular-nums ${r.strong ? 'font-semibold text-ink' : 'text-body'}`}>{r.value}</span>
          </li>
        ))}
      </ul>
      {footer && <div className="mt-1.5 border-t border-line pt-1.5 text-muted">{footer}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Donut                                                               */
/* ------------------------------------------------------------------ */

export interface DonutDatum {
  id: string;
  name: string;
  color: string;
  value: number;
  pct: number;
}

interface DonutProps {
  data: DonutDatum[];
  total: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  centerLabel?: string;
  height?: number;
}

export function DonutChart({ data, total, selectedId, onSelect, centerLabel = 'Spent', height = 300 }: DonutProps) {
  const { currency } = useMoney();
  const reduced = usePrefersReducedMotion();
  const [hover, setHover] = useState<number | undefined>(undefined);
  const activeIndex = selectedId ? data.findIndex((d) => d.id === selectedId) : hover;

  return (
    <div className="relative" style={{ height }} role="img" aria-label={`Donut chart of ${centerLabel.toLowerCase()} by category. ${data.map((d) => `${d.name} ${formatPct(d.pct)}`).join(', ')}.`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="64%"
            outerRadius="92%"
            paddingAngle={data.length > 1 ? 2 : 0}
            cornerRadius={5}
            stroke="var(--c-surface)"
            strokeWidth={2}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={!reduced}
            animationDuration={700}
            activeIndex={activeIndex === -1 ? undefined : activeIndex}
            activeShape={(p: unknown) => {
              const props = p as { cx: number; cy: number; innerRadius: number; outerRadius: number; startAngle: number; endAngle: number; fill: string };
              return <Sector cx={props.cx} cy={props.cy} innerRadius={props.innerRadius} outerRadius={props.outerRadius + 7} startAngle={props.startAngle} endAngle={props.endAngle} fill={props.fill} cornerRadius={5} stroke="var(--c-surface)" strokeWidth={2} />;
            }}
            onMouseEnter={(_, i) => setHover(i)}
            onMouseLeave={() => setHover(undefined)}
            onClick={(d: unknown) => onSelect?.((d as DonutDatum).id)}
            style={{ cursor: onSelect ? 'pointer' : 'default', outline: 'none' }}
          >
            {data.map((d) => (
              <Cell key={d.id} fill={d.color} style={{ outline: 'none', opacity: selectedId && selectedId !== d.id ? 0.45 : 1, transition: 'opacity .2s' }} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as DonutDatum;
              return <TipCard title={d.name} rows={[{ color: d.color, label: 'Amount', value: formatMoney(d.value, currency), strong: true }, { color: d.color, label: 'Share', value: formatPct(d.pct, 1) }]} footer={onSelect ? 'Click to see transactions' : undefined} />;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-muted">{centerLabel}</p>
          <p className="font-serif text-2xl font-medium tabular-nums text-ink sm:text-3xl">{formatMoney(total, currency, { trimWhole: true })}</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Income vs expenses                                                  */
/* ------------------------------------------------------------------ */

export function IncomeExpenseChart({ buckets, height = 300 }: { buckets: Bucket[]; height?: number }) {
  const { currency } = useMoney();
  const reduced = usePrefersReducedMotion();
  return (
    <div style={{ height }} role="img" aria-label="Bar chart comparing income and expenses over time. A table view is available.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={4} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--c-line)" strokeDasharray="3 4" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} interval="preserveStartEnd" minTickGap={12} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS} width={52} tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })} />
          <Tooltip
            cursor={{ fill: 'var(--c-surface2)', opacity: 0.6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const b = payload[0].payload as Bucket;
              return (
                <TipCard
                  title={b.label}
                  rows={[
                    { color: 'var(--c-sage)', label: 'Income', value: formatMoney(b.income, currency) },
                    { color: 'var(--c-peach)', label: 'Expenses', value: formatMoney(b.expenses, currency) },
                    { color: 'var(--c-ink)', label: 'Net', value: formatMoney(b.net, currency, { signed: true }), strong: true },
                  ]}
                />
              );
            }}
          />
          <Legend verticalAlign="top" align="left" height={30} iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-muted">{v}</span>} />
          <Bar dataKey="income" name="Income" fill="var(--c-sage)" radius={[5, 5, 0, 0]} maxBarSize={22} isAnimationActive={!reduced} />
          <Bar dataKey="expenses" name="Expenses" fill="var(--c-peach)" radius={[5, 5, 0, 0]} maxBarSize={22} isAnimationActive={!reduced} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Savings over time                                                   */
/* ------------------------------------------------------------------ */

export function SavingsLineChart({ buckets, height = 280 }: { buckets: Bucket[]; height?: number }) {
  const { currency } = useMoney();
  const reduced = usePrefersReducedMotion();
  return (
    <div style={{ height }} role="img" aria-label="Line chart of cumulative savings and money held in savings accounts over time. A table view is available.">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--c-line)" strokeDasharray="3 4" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} interval="preserveStartEnd" minTickGap={12} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS} width={52} tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })} />
          <Tooltip
            cursor={{ stroke: 'var(--c-line2)', strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const b = payload[0].payload as Bucket;
              return (
                <TipCard
                  title={b.label}
                  rows={[
                    { color: 'var(--c-ink)', label: 'Cumulative net', value: formatMoney(b.cumulativeNet, currency), strong: true },
                    { color: 'var(--c-blue-deep)', label: 'In savings accounts', value: formatMoney(b.savingsBalance, currency) },
                  ]}
                />
              );
            }}
          />
          <Legend verticalAlign="top" align="left" height={30} iconType="plainline" iconSize={14} formatter={(v) => <span className="text-xs text-muted">{v}</span>} />
          <Line type="monotone" dataKey="cumulativeNet" name="Cumulative net (income − expenses)" stroke="var(--c-ink)" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--c-surface)' }} isAnimationActive={!reduced} />
          <Line type="monotone" dataKey="savingsBalance" name="Held in savings accounts" stroke="var(--c-blue-deep)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--c-surface)' }} isAnimationActive={!reduced} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline                                                           */
/* ------------------------------------------------------------------ */

export function Sparkline({ values, color = 'var(--c-sage-deep)', width = 84, height = 28, label }: { values: number[]; color?: string; width?: number; height?: number; label: string }) {
  if (values.length < 2) return <span className="text-xs text-muted">-</span>;
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => [i * step, height - 3 - ((v - min) / span) * (height - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} role="img" aria-label={label} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} stroke="var(--c-surface)" strokeWidth={1.5} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Legend list used beside the donut                                   */
/* ------------------------------------------------------------------ */

export function SwatchLegend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
