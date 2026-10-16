/**
 * Turns untrusted JSON (a restored backup, or whatever is sitting in storage) into a valid
 * AppData. Anything malformed is dropped or repaired and reported, so a bad file can never put
 * the app into a state that breaks calculations.
 */
import { createEmptyData, DEFAULT_SETTINGS } from '../domain/defaults';
import { isValidDateStr } from '../domain/dates';
import {
  SCHEMA_VERSION,
  SPECIAL,
  type Account,
  type AppData,
  type Budget,
  type Category,
  type CategoryRule,
  type CategorySource,
  type Goal,
  type GoalEntry,
  type QuickAction,
  type Transaction,
  type TxType,
} from '../domain/types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export interface SanitizeResult {
  data: AppData;
  warnings: string[];
}

export function sanitizeAppData(raw: unknown): SanitizeResult {
  const warnings: string[] = [];
  const base = createEmptyData();
  if (!isObj(raw)) throw new Error('This file does not contain Pace data.');

  const src = raw as Obj;
  const note = (count: number, what: string) => {
    if (count > 0) warnings.push(`Skipped ${count} invalid ${what}${count === 1 ? '' : 's'}.`);
  };

  // Settings
  const s = isObj(src.settings) ? src.settings : {};
  const theme = s.theme === 'dark' || s.theme === 'system' ? s.theme : 'light';
  const settings = {
    ...DEFAULT_SETTINGS,
    userName: str(s.userName),
    currency: /^[A-Z]{3}$/.test(str(s.currency)) ? str(s.currency) : DEFAULT_SETTINGS.currency,
    theme: theme as 'light' | 'dark' | 'system',
    weekStartsOn: s.weekStartsOn === 0 ? (0 as const) : (1 as const),
    monthlySavingsTarget: Math.max(0, int(s.monthlySavingsTarget) ?? 0),
    autoSuggest: s.autoSuggest !== false,
    paymentMethods: arr(s.paymentMethods).filter((x): x is string => typeof x === 'string' && x.trim() !== ''),
    dismissedNotifications: arr(s.dismissedNotifications).filter((x): x is string => typeof x === 'string'),
  };
  if (settings.paymentMethods.length === 0 && !Array.isArray(s.paymentMethods)) settings.paymentMethods = [...DEFAULT_SETTINGS.paymentMethods];

  // Accounts
  let accounts: Account[] = arr(src.accounts)
    .filter(isObj)
    .map((a): Account | null => {
      const id = optStr(a.id);
      const name = optStr(a.name);
      if (!id || !name) return null;
      return { id, name, kind: a.kind === 'savings' ? 'savings' : 'spending', openingBalance: int(a.openingBalance) ?? 0, isDemo: a.isDemo === true ? true : undefined };
    })
    .filter((a): a is Account => a !== null);
  if (!accounts.some((a) => a.kind === 'spending')) accounts = [...base.accounts.filter((a) => a.kind === 'spending'), ...accounts];
  const accountIds = new Set(accounts.map((a) => a.id));
  const fallbackAccount = accounts.find((a) => a.kind === 'spending')!.id;

  // Categories: built-ins always exist; stored ones override their look.
  const storedCats = arr(src.categories).filter(isObj);
  const categories: Category[] = base.categories.map((c) => {
    const stored = storedCats.find((x) => x.id === c.id);
    if (!stored) return c;
    return { ...c, icon: optStr(stored.icon) ?? c.icon, color: /^#[0-9a-fA-F]{6}$/.test(str(stored.color)) ? str(stored.color) : c.color };
  });
  for (const c of storedCats) {
    const id = optStr(c.id);
    const name = optStr(c.name);
    if (!id || !name || categories.some((x) => x.id === id)) continue;
    const type = c.type === 'income' ? 'income' : 'expense';
    categories.push({ id, name, icon: optStr(c.icon) ?? '🏷️', color: /^#[0-9a-fA-F]{6}$/.test(str(c.color)) ? str(c.color) : '#B8AFA0', type, builtin: false });
  }
  const categoryIds = new Set(categories.map((c) => c.id));

  // Transactions
  let dropped = 0;
  const seen = new Set<string>();
  const transactions: Transaction[] = [];
  for (const t of arr(src.transactions)) {
    if (!isObj(t)) {
      dropped++;
      continue;
    }
    const id = optStr(t.id);
    const amount = int(t.amount);
    const type = t.type === 'income' || t.type === 'expense' || t.type === 'transfer' ? (t.type as TxType) : null;
    if (!id || seen.has(id) || amount === null || amount < 0 || !type || !isValidDateStr(t.date)) {
      dropped++;
      continue;
    }
    seen.add(id);
    const description = str(t.description).trim() || 'Untitled';
    let categoryId = str(t.categoryId, SPECIAL.other);
    let categorySource: CategorySource = ['manual', 'rule', 'auto', 'none'].includes(str(t.categorySource)) ? (t.categorySource as CategorySource) : 'manual';
    if (type === 'transfer') {
      categoryId = SPECIAL.savings;
      categorySource = 'rule';
    } else if (!categoryIds.has(categoryId)) {
      categoryId = SPECIAL.other;
      categorySource = 'none';
    }
    const accountId = accountIds.has(str(t.accountId)) ? str(t.accountId) : fallbackAccount;
    let toAccountId = optStr(t.toAccountId);
    if (type === 'transfer') {
      if (!toAccountId || !accountIds.has(toAccountId) || toAccountId === accountId) {
        const other = accounts.find((a) => a.id !== accountId && a.kind === 'savings') ?? accounts.find((a) => a.id !== accountId);
        if (!other) {
          dropped++;
          seen.delete(id);
          continue;
        }
        toAccountId = other.id;
      }
    } else toAccountId = undefined;
    transactions.push({
      id,
      type,
      description,
      amount,
      date: t.date as string,
      categoryId,
      categorySource,
      notes: optStr(t.notes),
      paymentMethod: optStr(t.paymentMethod),
      tags: arr(t.tags).filter((x): x is string => typeof x === 'string' && x.trim() !== ''),
      accountId,
      toAccountId,
      goalId: type === 'transfer' ? optStr(t.goalId) : undefined,
      refund: type === 'expense' && t.refund === true ? true : undefined,
      isDemo: t.isDemo === true ? true : undefined,
      importHash: optStr(t.importHash),
      createdAt: int(t.createdAt) ?? Date.now(),
      updatedAt: int(t.updatedAt) ?? Date.now(),
    });
  }
  note(dropped, 'transaction');

  // Budgets
  const budgets: Budget[] = arr(src.budgets)
    .filter(isObj)
    .map((b) => ({ categoryId: str(b.categoryId), amount: int(b.amount) ?? 0 }))
    .filter((b) => categoryIds.has(b.categoryId) && b.amount > 0);

  // Goals
  const goals: Goal[] = arr(src.goals)
    .filter(isObj)
    .map((g): Goal | null => {
      const id = optStr(g.id);
      const name = optStr(g.name);
      const target = int(g.target);
      if (!id || !name || target === null || target <= 0) return null;
      return {
        id,
        name,
        target,
        startingAmount: Math.max(0, int(g.startingAmount) ?? 0),
        targetDate: isValidDateStr(g.targetDate) ? (g.targetDate as string) : undefined,
        description: optStr(g.description),
        icon: optStr(g.icon) ?? '🎯',
        color: /^#[0-9a-fA-F]{6}$/.test(str(g.color)) ? str(g.color) : '#E8DDAA',
        startDate: isValidDateStr(g.startDate) ? (g.startDate as string) : new Date().toISOString().slice(0, 10),
        isDemo: g.isDemo === true ? true : undefined,
      };
    })
    .filter((g): g is Goal => g !== null);
  const goalIds = new Set(goals.map((g) => g.id));
  for (const t of transactions) if (t.goalId && !goalIds.has(t.goalId)) t.goalId = undefined;

  const goalEntries: GoalEntry[] = arr(src.goalEntries)
    .filter(isObj)
    .map((e): GoalEntry | null => {
      const id = optStr(e.id);
      const amount = int(e.amount);
      if (!id || !goalIds.has(str(e.goalId)) || amount === null || amount === 0 || !isValidDateStr(e.date)) return null;
      return { id, goalId: str(e.goalId), amount, date: e.date as string, note: optStr(e.note), isDemo: e.isDemo === true ? true : undefined };
    })
    .filter((e): e is GoalEntry => e !== null);

  const rules: CategoryRule[] = arr(src.rules)
    .filter(isObj)
    .map((r) => ({ id: str(r.id), pattern: str(r.pattern).trim().toLowerCase(), categoryId: str(r.categoryId), createdAt: int(r.createdAt) ?? Date.now() }))
    .filter((r) => r.id && r.pattern && categoryIds.has(r.categoryId));

  const quickActions: QuickAction[] = Array.isArray(src.quickActions)
    ? arr(src.quickActions)
        .filter(isObj)
        .map((q): QuickAction | null => {
          const id = optStr(q.id);
          const label = optStr(q.label);
          const type = q.type === 'income' || q.type === 'expense' || q.type === 'transfer' ? (q.type as TxType) : null;
          if (!id || !label || !type) return null;
          const amount = int(q.amount);
          return {
            id,
            label,
            emoji: optStr(q.emoji) ?? '⚡',
            type,
            description: str(q.description, label),
            amount: amount !== null && amount > 0 ? amount : undefined,
            categoryId: categoryIds.has(str(q.categoryId)) ? str(q.categoryId) : SPECIAL.other,
            paymentMethod: optStr(q.paymentMethod),
          };
        })
        .filter((q): q is QuickAction => q !== null)
    : base.quickActions;

  const m = isObj(src.meta) ? src.meta : {};
  const mode = m.mode === 'demo' || m.mode === 'user' ? m.mode : 'new';

  const data: AppData = {
    meta: { schemaVersion: SCHEMA_VERSION, mode, onboarded: m.onboarded === true, createdAt: int(m.createdAt) ?? Date.now() },
    settings,
    accounts,
    categories,
    transactions,
    budgets,
    goals,
    goalEntries,
    rules,
    quickActions,
  };
  return { data, warnings };
}

/* ---------- backup files ---------- */

export const BACKUP_APP_ID = 'pace-finance';

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  version: number;
  exportedAt: string;
  data: AppData;
}

export function createBackup(data: AppData): BackupFile {
  return { app: BACKUP_APP_ID, version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
}

export function parseBackup(text: string): SanitizeResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!isObj(json) || json.app !== BACKUP_APP_ID) throw new Error('That does not look like a Pace backup file.');
  if (typeof json.version === 'number' && json.version > SCHEMA_VERSION) {
    throw new Error('This backup was made by a newer version of Pace. Please update the app and try again.');
  }
  return sanitizeAppData(json.data);
}
