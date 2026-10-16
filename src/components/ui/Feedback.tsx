import { HelpCircle } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';

type Tone = 'sage' | 'blue' | 'peach' | 'butter' | 'neutral';

const TONES: Record<Tone, string> = {
  sage: 'bg-sage-soft text-sage-deep',
  blue: 'bg-blue-soft text-blue-deep',
  peach: 'bg-peach-soft text-peach-deep',
  butter: 'bg-butter-soft text-butter-deep',
  neutral: 'bg-surface2 text-muted',
};

export function Badge({ tone = 'neutral', children, className = '', title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

interface ProgressBarProps {
  /** 0-100. */
  pct: number;
  color?: string;
  label: string;
  height?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Progress bar with an accessible name and value. The fill animates in once. */
export function ProgressBar({ pct, color = 'var(--c-sage)', label, height = 'md', className = '' }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0));
  const h = height === 'sm' ? 'h-1.5' : height === 'lg' ? 'h-3' : 'h-2.5';
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={`w-full overflow-hidden rounded-full bg-surface2 ${h} ${className}`}
    >
      <div className="bar-grow h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${clamped}%`, background: color }} />
    </div>
  );
}

export function EmptyState({ icon, title, children, action, compact }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'py-8' : 'py-14'}`}>
      <div className="relative mb-4 grid h-16 w-16 place-items-center rounded-full bg-sage-soft text-sage-deep">
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-butter" aria-hidden />
        <span className="absolute -bottom-0.5 -left-1.5 h-2 w-2 rounded-full bg-blue" aria-hidden />
        {icon ?? <span className="text-2xl" aria-hidden>🌱</span>}
      </div>
      <h3 className="font-serif text-xl font-medium text-ink">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** A small "?" that explains a financial term on hover, focus, or tap. */
export function InfoTip({ text, label = 'More information' }: { text: ReactNode; label?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="grid h-5 w-5 place-items-center rounded-full text-muted/80 transition-colors hover:text-ink"
      >
        <HelpCircle size={14} />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-body shadow-[var(--shadow-pop)] [animation:fade-in_0.12s_ease_both]"
        >
          {text}
        </span>
      )}
    </span>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} aria-hidden />;
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-sm text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-sage border-t-transparent" aria-hidden />
      {label}
    </div>
  );
}

const CONFETTI_COLORS = ['#A8B5A0', '#E8DDAA', '#E8B9A5', '#B8C9D6', '#34483B', '#D8D0C4'];

/** A gentle burst of confetti; removes itself when finished. */
export function Confetti({ onDone }: { onDone: () => void }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.4 + Math.random() * 1.6,
        dx: `${(Math.random() - 0.5) * 220}px`,
        rot: `${(Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540)}deg`,
        size: 6 + Math.random() * 7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        round: Math.random() > 0.55,
      })),
    [],
  );
  useEffect(() => {
    const t = window.setTimeout(onDone, 4600);
    return () => window.clearTimeout(t);
  }, [onDone]);
  return (
    <div aria-hidden className="no-print pointer-events-none fixed inset-0 z-[120] overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 block"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.5,
            borderRadius: p.round ? '50%' : 2,
            background: p.color,
            animation: `confetti-fall ${p.duration}s ${p.delay}s cubic-bezier(0.25, 0.6, 0.4, 1) both`,
            ['--dx' as string]: p.dx,
            ['--rot' as string]: p.rot,
          }}
        />
      ))}
    </div>
  );
}
