/**
 * Money helpers. Amounts are integer minor units everywhere; floats are only used at the
 * very edge (display), never for arithmetic that gets stored.
 */

const decimalsCache = new Map<string, number>();

export function currencyDecimals(currency: string): number {
  const cached = decimalsCache.get(currency);
  if (cached !== undefined) return cached;
  let d = 2;
  try {
    d = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    d = 2;
  }
  decimalsCache.set(currency, d);
  return d;
}

export interface CurrencyInfo {
  code: string;
  name: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'SGD', name: 'Singapore dollar' },
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'NZD', name: 'New Zealand dollar' },
  { code: 'HKD', name: 'Hong Kong dollar' },
  { code: 'MYR', name: 'Malaysian ringgit' },
  { code: 'IDR', name: 'Indonesian rupiah' },
  { code: 'THB', name: 'Thai baht' },
  { code: 'PHP', name: 'Philippine peso' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'CNY', name: 'Chinese yuan' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'KRW', name: 'South Korean won' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'SEK', name: 'Swedish krona' },
  { code: 'AED', name: 'UAE dirham' },
  { code: 'ZAR', name: 'South African rand' },
  { code: 'BRL', name: 'Brazilian real' },
  { code: 'MXN', name: 'Mexican peso' },
];

/**
 * Unambiguous symbols for the currencies we offer. A browser's default for a "foreign" currency is
 * often the bare ISO code ("SGD 12.00" in en-US), which reads clumsily in a daily-use app.
 */
const SYMBOLS: Record<string, string> = {
  SGD: 'S$',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  NZD: 'NZ$',
  HKD: 'HK$',
  MYR: 'RM',
  IDR: 'Rp',
  THB: '฿',
  PHP: '₱',
  INR: '₹',
  CNY: 'CN¥',
  KRW: '₩',
  CHF: 'CHF',
  SEK: 'kr',
  AED: 'AED',
  ZAR: 'R',
  BRL: 'R$',
  MXN: 'MX$',
};

export function currencySymbol(currency: string): string {
  if (SYMBOLS[currency]) return SYMBOLS[currency];
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

const fmtCache = new Map<string, Intl.NumberFormat>();
function formatter(currency: string, compact: boolean, wholeUnits: boolean): Intl.NumberFormat {
  const key = `${currency}|${compact}|${wholeUnits}`;
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
        ...(wholeUnits ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
      });
    } catch {
      f = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'SGD' });
    }
    fmtCache.set(key, f);
  }
  return f;
}

export interface FormatMoneyOptions {
  /** Prefix "+" for positive values. Negative values always show "-". */
  signed?: boolean;
  /** Short form such as S$1.2K, for axes and tight spaces. */
  compact?: boolean;
  /** Drop the decimals (only when the value is a whole unit). */
  trimWhole?: boolean;
}

export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** currencyDecimals(currency);
}

export function formatMoney(minor: number, currency: string, opts: FormatMoneyOptions = {}): string {
  if (!Number.isFinite(minor)) return '-';
  const decimals = currencyDecimals(currency);
  const major = minor / 10 ** decimals;
  const whole = !!opts.trimWhole && Math.abs(minor) % 10 ** decimals === 0;
  const parts = formatter(currency, !!opts.compact, whole).formatToParts(Math.abs(major));
  const symbol = SYMBOLS[currency];
  const symbolIsWord = symbol ? /[A-Za-z]$/.test(symbol) : true;
  let text = '';
  parts.forEach((p, i) => {
    if (p.type === 'currency' && symbol) {
      text += symbol;
    } else if (p.type === 'literal' && symbol && !symbolIsWord && parts[i - 1]?.type === 'currency' && /^\s+$/.test(p.value)) {
      // Drop the gap the browser leaves after an ISO code when we swap in a compact symbol.
    } else {
      text += p.value;
    }
  });
  if (minor < 0) return `-${text}`;
  if (opts.signed && minor > 0) return `+${text}`;
  return text;
}

/** Plain number string for form inputs, e.g. 12550 -> "125.50". */
export function minorToInput(minor: number, currency: string): string {
  const decimals = currencyDecimals(currency);
  if (!Number.isFinite(minor)) return '';
  const neg = minor < 0;
  const abs = Math.abs(Math.round(minor));
  if (decimals === 0) return `${neg ? '-' : ''}${abs}`;
  const s = String(abs).padStart(decimals + 1, '0');
  return `${neg ? '-' : ''}${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
}

/**
 * Parse user-typed money into integer minor units using string arithmetic (no floats).
 * Accepts "1,234.56", "1234,56", "$12", "S$ 12.50", "(12.00)" and "-12". Returns null if invalid.
 */
export function parseAmount(raw: string | number, currency: string): number | null {
  const decimals = currencyDecimals(currency);
  let s = String(raw).trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/-/.test(s)) {
    negative = !negative;
    s = s.replace(/-/g, '');
  }
  s = s.replace(/[^\d.,]/g, '');
  if (!s || !/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let intPart: string;
  let fracPart = '';

  if (lastDot >= 0 && lastComma >= 0) {
    // Both separators present: whichever comes last is the decimal point.
    const sepIdx = Math.max(lastDot, lastComma);
    intPart = s.slice(0, sepIdx).replace(/[.,]/g, '');
    fracPart = s.slice(sepIdx + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const idx = s.lastIndexOf(sep);
    const after = s.slice(idx + 1);
    const count = s.split(sep).length - 1;
    // "1,234" (exactly three trailing digits after a comma) is read as thousands.
    const looksThousands = sep === ',' && after.length === 3 && decimals !== 3;
    if (count > 1 || looksThousands) {
      if (after.length !== 3) return null;
      intPart = s.replace(/[.,]/g, '');
    } else {
      intPart = s.slice(0, idx);
      fracPart = after;
    }
  } else {
    intPart = s;
  }

  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || (fracPart !== '' && !/^\d+$/.test(fracPart))) return null;

  // Trailing zeros beyond the currency's precision are harmless; real extra precision is rejected.
  if (fracPart.length > decimals) {
    const extra = fracPart.slice(decimals);
    if (/[^0]/.test(extra)) return null;
    fracPart = fracPart.slice(0, decimals);
  }
  fracPart = fracPart.padEnd(decimals, '0');

  const minor = Number(intPart + fracPart);
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}

/** part / whole as a percentage, or null when it would be meaningless (whole <= 0). */
export function safePct(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return (part / whole) * 100;
}

/** Percent for display; never NaN/Infinity. */
export function formatPct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${Number(value.toFixed(digits)).toFixed(digits)}%`;
}

/** Rescale stored minor units when the currency's decimal precision changes (keeps the nominal number). */
export function rescaleMinor(minor: number, fromDecimals: number, toDecimals: number): number {
  if (fromDecimals === toDecimals) return minor;
  if (toDecimals > fromDecimals) return minor * 10 ** (toDecimals - fromDecimals);
  const f = 10 ** (fromDecimals - toDecimals);
  return Math.sign(minor) * Math.round(Math.abs(minor) / f);
}
