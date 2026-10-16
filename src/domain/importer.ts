/**
 * CSV import pipeline: guess a column mapping, validate every row, spot duplicates of
 * transactions you already have (or imported before), and build ready-to-save transactions.
 */
import { categoryAllowsType, normalizeDescription, suggestCategory } from './categorize';
import { toCsv } from './csv';
import { isValidDateStr } from './dates';
import { hashString, uid } from './ids';
import { minorToInput, parseAmount } from './money';
import { SPECIAL, type AppData, type Category, type CategorySource, type Transaction, type TxType } from './types';

export type ImportField = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'type' | 'category' | 'notes' | 'paymentMethod' | 'tags';

export const IMPORT_FIELDS: { field: ImportField; label: string; required?: boolean; hint?: string }[] = [
  { field: 'date', label: 'Date', required: true },
  { field: 'description', label: 'Description', required: true },
  { field: 'amount', label: 'Amount', hint: 'One column, positive and/or negative' },
  { field: 'debit', label: 'Money out (debit)', hint: 'Use instead of Amount when your bank splits columns' },
  { field: 'credit', label: 'Money in (credit)' },
  { field: 'type', label: 'Type', hint: 'income / expense / refund / transfer' },
  { field: 'category', label: 'Category' },
  { field: 'paymentMethod', label: 'Payment method' },
  { field: 'tags', label: 'Tags', hint: 'Separated by ; or ,' },
  { field: 'notes', label: 'Notes' },
];

export type Mapping = Partial<Record<ImportField, number>>;
export type DateFormat = 'iso' | 'dmy' | 'mdy';

export interface ImportOptions {
  dateFormat: DateFormat;
  /** For a single signed Amount column: treat positive numbers as spending (credit card statements). */
  positiveIsExpense: boolean;
  accountId: string;
}

const GUESS: Record<ImportField, RegExp> = {
  date: /^(date|transaction date|posted|posting date|trans date|day)$/i,
  description: /^(description|details?|memo|payee|narrative|merchant|name|particulars|transaction|reference)$/i,
  amount: /^(amount|value|sum|total|amt)$/i,
  debit: /^(debit|withdrawal|withdrawals|money out|paid out|expense|out)$/i,
  credit: /^(credit|deposit|deposits|money in|paid in|income|in)$/i,
  type: /^(type|kind|transaction type)$/i,
  category: /^(category|categories|group)$/i,
  notes: /^(notes?|comment|comments|remarks?)$/i,
  paymentMethod: /^(payment method|method|payment|account|card|source)$/i,
  tags: /^(tags?|labels?)$/i,
};

export function guessMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<number>();
  for (const field of Object.keys(GUESS) as ImportField[]) {
    const idx = headers.findIndex((h, i) => !used.has(i) && GUESS[field].test(h.trim()));
    if (idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }
  if (mapping.debit !== undefined || mapping.credit !== undefined) {
    if (mapping.amount !== undefined && mapping.debit !== undefined && mapping.credit !== undefined) delete mapping.amount;
  }
  return mapping;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseImportDate(raw: string, fmt: DateFormat): string | null {
  const s = raw.trim();
  if (!s) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const make = (y: number, m: number, d: number) => {
    const out = `${y}-${pad(m)}-${pad(d)}`;
    return isValidDateStr(out) ? out : null;
  };

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return make(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/. ,]+(\d{2,4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi < 0) return null;
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return make(y, mi + 1, +m[1]);
  }
  m = s.match(/^([A-Za-z]{3,9})[ ]+(\d{1,2}),?[ ]+(\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi < 0) return null;
    return make(+m[3], mi + 1, +m[2]);
  }

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[T\s].*)?$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    if (fmt === 'mdy') return make(y, a, b);
    return make(y, b, a); // 'dmy' (and 'iso' falls back to day-first for slashed dates)
  }
  return null;
}

function classifyType(raw: string): { type: TxType; refund: boolean } | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (/refund|reversal|cashback|chargeback/.test(t)) return { type: 'expense', refund: true };
  if (/transfer|saving/.test(t)) return { type: 'transfer', refund: false };
  if (/income|credit|deposit|salary|received|in$/.test(t)) return { type: 'income', refund: false };
  if (/expense|debit|withdraw|payment|purchase|spend|out$/.test(t)) return { type: 'expense', refund: false };
  return null;
}

export function matchCategoryByName(raw: string, categories: Category[], type: TxType): Category | null {
  const wanted = normalizeDescription(raw);
  if (!wanted) return null;
  const candidates = categories.filter((c) => categoryAllowsType(c, type));
  return (
    candidates.find((c) => normalizeDescription(c.name) === wanted) ??
    candidates.find((c) => normalizeDescription(c.name).startsWith(wanted)) ??
    null
  );
}

export type ImportStatus = 'ok' | 'error' | 'duplicate';

export interface ImportRow {
  index: number;
  raw: string[];
  status: ImportStatus;
  errors: string[];
  tx?: Transaction;
}

export function fingerprintBase(t: Pick<Transaction, 'date' | 'type' | 'amount' | 'description' | 'refund'>): string {
  const kind = t.type === 'expense' && t.refund ? 'refund' : t.type;
  return `${t.date}|${kind}|${t.amount}|${normalizeDescription(t.description)}`;
}

export function buildImportRows(
  rows: string[][],
  mapping: Mapping,
  options: ImportOptions,
  data: AppData,
): ImportRow[] {
  const currency = data.settings.currency;
  const cell = (r: string[], f: ImportField) => (mapping[f] === undefined ? '' : (r[mapping[f] as number] ?? '').trim());

  // Existing fingerprints, counted so a genuine repeat purchase isn't mistaken for a re-import.
  const existing = new Map<string, number>();
  for (const t of data.transactions) {
    const k = fingerprintBase(t);
    existing.set(k, (existing.get(k) ?? 0) + 1);
  }
  const seenInFile = new Map<string, number>();
  const now = Date.now();

  return rows.map((raw, index) => {
    const errors: string[] = [];

    const date = parseImportDate(cell(raw, 'date'), options.dateFormat);
    if (!date) errors.push(cell(raw, 'date') ? `Unrecognised date "${cell(raw, 'date')}"` : 'Missing date');

    const description = cell(raw, 'description');
    if (!description) errors.push('Missing description');

    let type: TxType = 'expense';
    let refund = false;
    let amount: number | null = null;

    const typeText = cell(raw, 'type');
    const classified = typeText ? classifyType(typeText) : null;
    if (typeText && !classified) errors.push(`Unknown type "${typeText}"`);

    if (mapping.amount !== undefined && cell(raw, 'amount') !== '') {
      const parsed = parseAmount(cell(raw, 'amount'), currency);
      if (parsed === null) errors.push(`Invalid amount "${cell(raw, 'amount')}"`);
      else {
        amount = Math.abs(parsed);
        if (classified) ({ type, refund } = classified);
        else if (parsed < 0) type = options.positiveIsExpense ? 'income' : 'expense';
        else type = options.positiveIsExpense ? 'expense' : 'income';
      }
    } else if (mapping.debit !== undefined || mapping.credit !== undefined) {
      const debitRaw = cell(raw, 'debit');
      const creditRaw = cell(raw, 'credit');
      const debit = debitRaw ? parseAmount(debitRaw, currency) : null;
      const credit = creditRaw ? parseAmount(creditRaw, currency) : null;
      if (debitRaw && debit === null) errors.push(`Invalid debit "${debitRaw}"`);
      else if (creditRaw && credit === null) errors.push(`Invalid credit "${creditRaw}"`);
      else if (debit && credit) errors.push('Both debit and credit are filled in');
      else if (debit) {
        amount = Math.abs(debit);
        type = 'expense';
      } else if (credit) {
        amount = Math.abs(credit);
        type = 'income';
      } else errors.push('Missing amount');
      if (classified && amount !== null) ({ type, refund } = classified);
    } else {
      errors.push('Missing amount');
    }
    if (amount !== null && amount === 0) errors.push('Amount is zero');

    if (errors.length > 0 || !date || amount === null) return { index, raw, status: 'error' as const, errors };

    // Category: an explicit column wins (stored as the user's own choice); otherwise suggest.
    let categoryId: string = SPECIAL.other;
    let categorySource: CategorySource = 'none';
    if (type === 'transfer') {
      categoryId = SPECIAL.savings;
      categorySource = 'rule';
    } else {
      const named = cell(raw, 'category') ? matchCategoryByName(cell(raw, 'category'), data.categories, type) : null;
      if (named && named.id !== SPECIAL.other) {
        categoryId = named.id;
        categorySource = 'manual';
      } else {
        const s = suggestCategory(description, type, data);
        categoryId = s.categoryId;
        categorySource = s.source;
      }
    }

    const savings = data.accounts.find((a) => a.kind === 'savings');
    const tags = cell(raw, 'tags')
      .split(/[;,|]/)
      .map((x) => x.trim().replace(/^#/, ''))
      .filter(Boolean);

    const tx: Transaction = {
      id: uid('tx'),
      type,
      description,
      amount,
      date,
      categoryId,
      categorySource,
      notes: cell(raw, 'notes') || undefined,
      paymentMethod: cell(raw, 'paymentMethod') || undefined,
      tags,
      accountId: options.accountId,
      toAccountId: type === 'transfer' ? savings?.id : undefined,
      refund: refund || undefined,
      createdAt: now,
      updatedAt: now,
    };

    const base = fingerprintBase(tx);
    const nth = (seenInFile.get(base) ?? 0) + 1;
    seenInFile.set(base, nth);
    tx.importHash = hashString(`${base}#${nth}`);
    const isDuplicate = nth <= (existing.get(base) ?? 0);
    return { index, raw, status: isDuplicate ? ('duplicate' as const) : ('ok' as const), errors: isDuplicate ? ['Already in your transactions'] : [], tx };
  });
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export function transactionsToCsv(txs: Transaction[], data: Pick<AppData, 'categories' | 'accounts' | 'settings'>): string {
  const cats = new Map(data.categories.map((c) => [c.id, c.name]));
  const accs = new Map(data.accounts.map((a) => [a.id, a.name]));
  const header = ['Date', 'Type', 'Description', 'Amount', 'Category', 'Payment method', 'Account', 'To account', 'Tags', 'Notes'];
  const rows = [...txs]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((t) => [
      t.date,
      t.type === 'expense' && t.refund ? 'Refund' : t.type === 'transfer' ? 'Transfer' : t.type === 'income' ? 'Income' : 'Expense',
      t.description,
      minorToInput(t.amount, data.settings.currency),
      t.type === 'transfer' ? 'Savings' : (cats.get(t.categoryId) ?? ''),
      t.paymentMethod ?? '',
      accs.get(t.accountId) ?? '',
      t.toAccountId ? (accs.get(t.toAccountId) ?? '') : '',
      t.tags.join('; '),
      t.notes ?? '',
    ]);
  return toCsv([header, ...rows], [2, 5, 6, 7, 8, 9]);
}
