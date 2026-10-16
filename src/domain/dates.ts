/**
 * Local-calendar date helpers.
 *
 * Dates are 'YYYY-MM-DD' strings in the user's local calendar. We never go through
 * `toISOString()` or `new Date('YYYY-MM-DD')` (both are UTC based and shift the day
 * for users west or east of UTC), so month boundaries are always exactly what the user sees.
 */

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(now: Date = new Date()): string {
  return toDateStr(now);
}

/** Parse a 'YYYY-MM-DD' string into a Date at local midnight. */
export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidDateStr(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 1900 || y > 2200) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export type MonthKey = string; // 'YYYY-MM'

export const monthKeyOf = (dateStr: string): MonthKey => dateStr.slice(0, 7);
export const currentMonthKey = (now: Date = new Date()): MonthKey => todayStr(now).slice(0, 7);
export const yearOf = (dateStr: string): number => Number(dateStr.slice(0, 4));

export function addMonths(key: MonthKey, n: number): MonthKey {
  const [y, m] = key.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function monthDiff(a: MonthKey, b: MonthKey): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

export function daysInMonth(key: MonthKey): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthRange(key: MonthKey): { from: string; to: string } {
  return { from: `${key}-01`, to: `${key}-${pad(daysInMonth(key))}` };
}

export function addDays(dateStr: string, n: number): string {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function diffDays(a: string, b: string): number {
  const da = parseDateStr(a);
  const db = parseDateStr(b);
  // Use UTC to keep the diff exact across daylight-saving transitions.
  return Math.round(
    (Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) -
      Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) /
      86_400_000,
  );
}

/** The first day of the week containing `dateStr`. weekStartsOn: 0 = Sunday, 1 = Monday. */
export function weekStartOf(dateStr: string, weekStartsOn: 0 | 1 = 1): string {
  const d = parseDateStr(dateStr);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  return addDays(dateStr, -diff);
}

export function monthsInRange(fromKey: MonthKey, toKey: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let k = fromKey; monthDiff(k, toKey) >= 0; k = addMonths(k, 1)) out.push(k);
  return out;
}

export function inRange(dateStr: string, from: string, to: string): boolean {
  return dateStr >= from && dateStr <= to;
}

/* ---------- formatting ---------- */

export function formatMonthLabel(key: MonthKey, style: 'long' | 'short' = 'long'): string {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: style === 'long' ? 'long' : 'short',
    year: 'numeric',
  }).format(new Date(y, m - 1, 1));
}

export function formatMonthName(key: MonthKey, style: 'long' | 'short' = 'long'): string {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: style }).format(new Date(y, m - 1, 1));
}

export function formatDate(
  dateStr: string,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  return new Intl.DateTimeFormat(undefined, opts).format(parseDateStr(dateStr));
}

export function formatDayHeading(dateStr: string, today: string = todayStr()): string {
  if (dateStr === today) return 'Today';
  if (dateStr === addDays(today, -1)) return 'Yesterday';
  return formatDate(dateStr, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function weekdayLabels(weekStartsOn: 0 | 1): string[] {
  const base = new Date(2023, 0, 1); // a Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + ((i + weekStartsOn) % 7));
    return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d);
  });
}
