import {
  SCHEMA_VERSION,
  SPECIAL,
  type Account,
  type AppData,
  type Category,
  type QuickAction,
  type Settings,
} from './types';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'food', name: 'Food & Dining', icon: '🍜', color: '#D9937A', type: 'expense', builtin: true },
  { id: 'groceries', name: 'Groceries', icon: '🛒', color: '#9DB08F', type: 'expense', builtin: true },
  { id: 'transport', name: 'Transport', icon: '🚗', color: '#7FA3BA', type: 'expense', builtin: true },
  { id: 'travel', name: 'Travel', icon: '✈️', color: '#6FA8A0', type: 'expense', builtin: true },
  { id: 'shopping', name: 'Shopping', icon: '🛍️', color: '#E8B9A5', type: 'expense', builtin: true },
  { id: 'housing', name: 'Housing & Bills', icon: '🏠', color: '#6F8577', type: 'expense', builtin: true },
  { id: 'health', name: 'Health & Wellness', icon: '💊', color: '#A9CDB9', type: 'expense', builtin: true },
  { id: 'entertainment', name: 'Entertainment', icon: '🎮', color: '#B9A6CF', type: 'expense', builtin: true },
  { id: 'education', name: 'Education', icon: '📚', color: '#D8C873', type: 'expense', builtin: true },
  { id: 'personal', name: 'Personal Care', icon: '💄', color: '#E2A3B5', type: 'expense', builtin: true },
  { id: 'gifts', name: 'Gifts & Donations', icon: '🎁', color: '#E6C28E', type: 'expense', builtin: true },
  { id: SPECIAL.savings, name: 'Savings', icon: '💰', color: '#E8DDAA', type: 'transfer', builtin: true },
  { id: SPECIAL.salary, name: 'Salary & Income', icon: '💼', color: '#A8B5A0', type: 'income', builtin: true },
  { id: SPECIAL.other, name: 'Other / Uncategorized', icon: '📦', color: '#B8AFA0', type: 'both', builtin: true },
];

/** Categories that can never be deleted or renamed because the app logic relies on them. */
export const PROTECTED_CATEGORY_IDS: string[] = [SPECIAL.other, SPECIAL.savings, SPECIAL.salary];

export const CATEGORY_COLOR_CHOICES = [
  '#D9937A', '#E8B9A5', '#E6C28E', '#E8DDAA', '#D8C873', '#9DB08F',
  '#A8B5A0', '#A9CDB9', '#6FA8A0', '#7FA3BA', '#B8C9D6', '#8EA0C9',
  '#B9A6CF', '#E2A3B5', '#C98B9B', '#6F8577', '#B8AFA0', '#8C8478',
];

export const CATEGORY_EMOJI_CHOICES = [
  '🍜', '🍔', '☕', '🍰', '🛒', '🥦', '🚗', '🚇', '🛵', '⛽', '✈️', '🏨', '🛍️', '👕', '👟', '🏠',
  '💡', '📱', '🌐', '💊', '🏥', '🧘', '🏋️', '🎮', '🎬', '🎵', '📺', '📚', '🎓', '💄', '💇', '🎁',
  '❤️', '🐶', '🐱', '👶', '🧸', '🌱', '🔧', '🧾', '💼', '💻', '📈', '🏦', '💰', '🪙', '🎯', '📦',
];

export const DEFAULT_PAYMENT_METHODS = ['Cash', 'Debit card', 'Credit card', 'PayNow', 'Bank transfer', 'E-wallet'];

export const DEFAULT_SETTINGS: Settings = {
  userName: '',
  currency: 'SGD',
  theme: 'light',
  weekStartsOn: 1,
  monthlySavingsTarget: 0,
  autoSuggest: true,
  paymentMethods: DEFAULT_PAYMENT_METHODS,
  dismissedNotifications: [],
};

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: SPECIAL.mainAccount, name: 'Main account', kind: 'spending', openingBalance: 0 },
  { id: SPECIAL.savingsAccount, name: 'Savings account', kind: 'savings', openingBalance: 0 },
];

export const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { id: 'qa-coffee', label: 'Coffee', emoji: '☕', type: 'expense', description: 'Coffee', categoryId: 'food', amount: 550 },
  { id: 'qa-lunch', label: 'Lunch', emoji: '🍜', type: 'expense', description: 'Lunch', categoryId: 'food', amount: 800 },
  { id: 'qa-transit', label: 'Transit', emoji: '🚇', type: 'expense', description: 'MRT / Bus', categoryId: 'transport', amount: 300 },
  { id: 'qa-groceries', label: 'Groceries', emoji: '🛒', type: 'expense', description: 'Groceries', categoryId: 'groceries' },
  { id: 'qa-salary', label: 'Salary', emoji: '💼', type: 'income', description: 'Salary', categoryId: SPECIAL.salary },
];

export function createEmptyData(): AppData {
  return {
    meta: { schemaVersion: SCHEMA_VERSION, mode: 'new', onboarded: false, createdAt: Date.now() },
    settings: { ...DEFAULT_SETTINGS, paymentMethods: [...DEFAULT_PAYMENT_METHODS], dismissedNotifications: [] },
    accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    transactions: [],
    budgets: [],
    goals: [],
    goalEntries: [],
    rules: [],
    quickActions: DEFAULT_QUICK_ACTIONS.map((q) => ({ ...q })),
  };
}
