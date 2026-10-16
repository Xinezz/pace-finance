import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';
import { addMonths, currentMonthKey, formatMonthLabel, formatMonthName } from '../../domain/dates';
import { useUi } from '../../state/ui';
import { IconButton } from '../ui/Button';
import { Popover } from '../ui/Popover';

export function MonthSelector({ compact }: { compact?: boolean }) {
  const { month, setMonth, shiftMonth } = useUi();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));
  const nowKey = currentMonthKey();
  const isCurrent = month === nowKey;

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Choose month">
      <IconButton label="Previous month" size="sm" onClick={() => shiftMonth(-1)}>
        <ChevronLeft size={18} />
      </IconButton>
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setYear(Number(month.slice(0, 4)));
          setOpen((o) => !o);
        }}
        className={`flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface2 sm:px-3 ${compact ? 'min-w-0' : 'justify-center sm:min-w-[9.5rem]'}`}
      >
        <CalendarDays size={15} className="hidden text-sage-deep sm:block" aria-hidden />
        <span className="tabular-nums sm:hidden">{formatMonthLabel(month, 'short')}</span>
        <span className="hidden tabular-nums sm:inline">{formatMonthLabel(month, compact ? 'short' : 'long')}</span>
      </button>
      <IconButton label="Next month" size="sm" onClick={() => shiftMonth(1)} disabled={month >= addMonths(nowKey, 12)}>
        <ChevronRight size={18} />
      </IconButton>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} label="Pick a month" width={288}>
        <div className="p-1">
          <div className="mb-2 flex items-center justify-between">
            <IconButton label="Previous year" size="sm" onClick={() => setYear((y) => y - 1)}>
              <ChevronLeft size={16} />
            </IconButton>
            <span className="font-serif text-lg text-ink tabular-nums">{year}</span>
            <IconButton label="Next year" size="sm" onClick={() => setYear((y) => y + 1)}>
              <ChevronRight size={16} />
            </IconButton>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 12 }, (_, i) => {
              const key = `${year}-${String(i + 1).padStart(2, '0')}`;
              const selected = key === month;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setMonth(key);
                    setOpen(false);
                  }}
                  className={`rounded-xl px-2 py-2 text-sm transition-colors ${selected ? 'bg-primary font-semibold text-on-primary' : key === nowKey ? 'bg-sage-soft text-sage-deep hover:bg-sage/30' : 'text-body hover:bg-surface2'}`}
                >
                  {formatMonthName(key, 'short')}
                </button>
              );
            })}
          </div>
          {!isCurrent && (
            <button
              type="button"
              onClick={() => {
                setMonth(nowKey);
                setOpen(false);
              }}
              className="mt-2 w-full rounded-xl py-2 text-sm font-medium text-sage-deep hover:bg-sage-soft"
            >
              Jump to this month
            </button>
          )}
        </div>
      </Popover>
    </div>
  );
}
