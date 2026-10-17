/**
 * Core data model. All money is stored as integer minor units (e.g. cents for SGD).
 * All dates are local calendar dates stored as 'YYYY-MM-DD' strings so that filtering
 * never depends on UTC conversion or the machine's timezone offset.
 */

export type TxType = 'income' | 'expense' | 'transfer';

/**
 * How a transaction got its category.
 *  - manual: the user chose it. Nothing may ever override this.
 *  - rule:   matched one of the user's remembered preferences.
 *  - auto:   suggested by the built-in keyword matcher (can be reviewed/confirmed).
 *  - none:   not categorized yet (shows up in "Needs Your Attention").
 */
export type CategorySource = 'manual' | 'rule' | 'auto' | 'none';

export interface Transaction {
  id: string;
  type: TxType;
  description: string;
  /** Always a non-negative integer in minor units. The sign comes from `type` / `refund`. */
  amount: number;
  date: string;
  categoryId: string;
  categorySource: CategorySource;
  notes?: string;
  paymentMethod?: string;
  tags: string[];
  /** The account this transaction touches (the source account for transfers). */
  accountId: string;
  /** Transfers only: destination account. */
  toAccountId?: string;
  /** Transfers only: the savings goal this movement is allocated to (or released from). */
  goalId?: string;
  /** Expenses only: money coming back (reduces spending in the category). */
  refund?: boolean;
  isDemo?: boolean;
  /** Fingerprint used to avoid importing the same CSV row twice. */
  importHash?: string;
  createdAt: number;
  updatedAt: number;
}

export type AccountKind = 'spending' | 'savings';

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  /** Signed minor units. Balance = opening balance + recorded transactions. */
  openingBalance: number;
  isDemo?: boolean;
}

export type CategoryType = 'expense' | 'income' | 'both' | 'transfer';

export interface Category {
  id: string;
  name: string;
  /** An emoji. */
  icon: string;
  color: string;
  type: CategoryType;
  builtin: boolean;
}

export interface Budget {
  categoryId: string;
  /** Monthly limit in minor units. */
  amount: number;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  /** Amount already saved when the goal was created. */
  startingAmount: number;
  targetDate?: string;
  description?: string;
  icon: string;
  color: string;
  /** 'YYYY-MM-DD' - the start of the pace calculation. */
  startDate: string;
  isDemo?: boolean;
}

/** A manual allocation (+) or release (-) of money to/from a goal, without moving cash. */
export interface GoalEntry {
  id: string;
  goalId: string;
  amount: number;
  date: string;
  note?: string;
  isDemo?: boolean;
}

/** A remembered preference: descriptions containing `pattern` go to `categoryId`. */
export interface CategoryRule {
  id: string;
  pattern: string;
  categoryId: string;
  createdAt: number;
}

export interface QuickAction {
  id: string;
  label: string;
  emoji: string;
  type: TxType;
  description: string;
  amount?: number;
  categoryId: string;
  paymentMethod?: string;
}

export type ThemeSetting = 'light' | 'dark' | 'system';

export interface Settings {
  userName: string;
  currency: string;
  /** No longer used for display: the theme is now a per-device choice (see state/theme.tsx). Kept for older saved data. */
  theme: ThemeSetting;
  weekStartsOn: 0 | 1;
  /** Optional monthly savings target, minor units. 0 = not set. */
  monthlySavingsTarget: number;
  /** Suggest categories from built-in keywords. User rules and manual choices always win. */
  autoSuggest: boolean;
  paymentMethods: string[];
  dismissedNotifications: string[];
}

export type AppMode = 'new' | 'demo' | 'user';

export interface Meta {
  schemaVersion: number;
  mode: AppMode;
  onboarded: boolean;
  createdAt: number;
}

export interface AppData {
  meta: Meta;
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  goalEntries: GoalEntry[];
  rules: CategoryRule[];
  quickActions: QuickAction[];
}

export const SCHEMA_VERSION = 1;

export const SPECIAL = {
  other: 'other',
  salary: 'salary',
  savings: 'savings',
  mainAccount: 'acc-main',
  savingsAccount: 'acc-savings',
} as const;
