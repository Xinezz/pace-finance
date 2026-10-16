import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { delta } from '../domain/calc';
import { InfoTip } from './ui/Feedback';

type Accent = 'ink' | 'sage' | 'peach' | 'butter' | 'blue';

const ACCENT: Record<Accent, { dot: string; bubble: string }> = {
  ink: { dot: 'bg-ink', bubble: 'bg-surface2 text-ink' },
  sage: { dot: 'bg-sage', bubble: 'bg-sage-soft text-sage-deep' },
  peach: { dot: 'bg-peach', bubble: 'bg-peach-soft text-peach-deep' },
  butter: { dot: 'bg-butter', bubble: 'bg-butter-soft text-butter-deep' },
  blue: { dot: 'bg-blue', bubble: 'bg-blue-soft text-blue-deep' },
};

interface StatCardProps {
  label: string;
  tip?: ReactNode;
  icon: ReactNode;
  accent: Accent;
  value: ReactNode;
  children?: ReactNode;
  className?: string;
  hero?: boolean;
}

export function StatCard({ label, tip, icon, accent, value, children, className = '', hero }: StatCardProps) {
  const a = ACCENT[accent];
  return (
    <article className={`stat-card group relative overflow-hidden rounded-[1.25rem] border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] sm:p-5 ${className}`}>
      <span className={`absolute inset-x-5 top-0 h-0.5 rounded-b-full ${a.dot}`} aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1 font-sans text-[13px] font-medium text-muted">
          {label}
          {tip && <InfoTip text={tip} label={`About ${label}`} />}
        </h3>
        <span className={`grid h-8 w-8 place-items-center rounded-xl ${a.bubble}`}>{icon}</span>
      </div>
      <p className={`mt-3 font-serif font-medium leading-none tabular-nums text-ink ${hero ? 'stat-value-hero' : 'stat-value'}`}>{value}</p>
      {children && <div className="mt-2.5 text-xs leading-snug text-muted">{children}</div>}
    </article>
  );
}

interface DeltaProps {
  current: number;
  previous: number;
  /** Which direction counts as good news. */
  goodWhen: 'up' | 'down';
  label: string;
}

/** "▼ 12% vs last month", coloured by whether the change is good news. Never shows NaN. */
export function DeltaNote({ current, previous, goodWhen, label }: DeltaProps) {
  if (previous <= 0) {
    return <span>{current > 0 ? `Nothing to compare with ${label} yet` : `No activity ${label}`}</span>;
  }
  const d = delta(current, previous);
  const pct = d.pct === null ? 0 : Math.round(Math.abs(d.pct));
  if (pct === 0) {
    return (
      <span className="inline-flex items-center gap-1">
        <Minus size={12} aria-hidden /> About the same as {label}
      </span>
    );
  }
  const up = d.diff > 0;
  const good = (up && goodWhen === 'up') || (!up && goodWhen === 'down');
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${good ? 'bg-sage-soft text-sage-deep' : 'bg-peach-soft text-peach-deep'}`}>
        <Icon size={12} aria-hidden />
        {pct}%
      </span>
      <span>
        {up ? 'more' : 'less'} than {label}
      </span>
    </span>
  );
}
