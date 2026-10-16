/**
 * All state transitions live here as a pure reducer: given the current data and an action it
 * returns new data and never mutates. That keeps every rule (what counts as manual, what a deleted
 * category does to its transactions, ...) in one testable place.
 *
 * Unchanged items keep their object identity, which lets the storage layer write only what changed.
 */
import { applyRuleToExisting, categoryAllowsType, suggestCategory } from '../domain/categorize';
import { PROTECTED_CATEGORY_IDS, createEmptyData } from '../domain/defaults';
import { currencyDecimals, rescaleMinor } from '../domain/money';
import {
  SPECIAL,
  type Account,
  type AppData,
  type Budget,
  type Category,
  type CategoryRule,
  type Goal,
  type GoalEntry,
  type QuickAction,
  type Settings,
  type Transaction,
} from '../domain/types';

export interface OnboardingPayload {
  userName: string;
  currency: string;
  spendingBalance: number;
  savingsBalance: number;
  budgets: Budget[];
  monthlySavingsTarget: number;
}

export type Action =
  | { type: 'replace'; data: AppData }
  | { type: 'startFresh' }
  | { type: 'finishOnboarding'; payload: OnboardingPayload }
  | { type: 'addTx'; tx: Transaction }
  | { type: 'addTxs'; txs: Transaction[] }
  | { type: 'updateTx'; id: string; patch: Partial<Transaction> }
  | { type: 'deleteTxs'; ids: string[] }
  | { type: 'setCategory'; ids: string[]; categoryId: string }
  | { type: 'confirmAuto'; ids: string[] }
  | { type: 'addCategory'; category: Category }
  | { type: 'updateCategory'; id: string; patch: Partial<Pick<Category, 'name' | 'icon' | 'color'>> }
  | { type: 'deleteCategory'; id: string }
  | { type: 'addRule'; rule: CategoryRule; applyToExisting: boolean }
  | { type: 'deleteRule'; id: string }
  | { type: 'setBudget'; categoryId: string; amount: number }
  | { type: 'addGoal'; goal: Goal }
  | { type: 'updateGoal'; id: string; patch: Partial<Goal> }
  | { type: 'deleteGoal'; id: string }
  | { type: 'addGoalEntry'; entry: GoalEntry }
  | { type: 'deleteGoalEntry'; id: string }
  | { type: 'addAccount'; account: Account }
  | { type: 'updateAccount'; id: string; patch: Partial<Pick<Account, 'name' | 'openingBalance'>> }
  | { type: 'deleteAccount'; id: string }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  | { type: 'changeCurrency'; currency: string }
  | { type: 'dismissNotice'; id: string }
  | { type: 'resetNotices' }
  | { type: 'addQuickAction'; action: QuickAction }
  | { type: 'deleteQuickAction'; id: string }
  | { type: 'clearDemo' }
  | { type: 'eraseAll' };

const now = () => Date.now();

function mapIds<T extends { id: string }>(list: T[], ids: Set<string>, fn: (item: T) => T): T[] {
  let changed = false;
  const out = list.map((item) => {
    if (!ids.has(item.id)) return item;
    const next = fn(item);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? out : list;
}

/** Make sure a transaction is internally consistent after an edit. */
function normalizeTx(t: Transaction, data: AppData): Transaction {
  if (t.type === 'transfer') {
    return { ...t, categoryId: SPECIAL.savings, categorySource: 'rule', refund: undefined };
  }
  const cat = data.categories.find((c) => c.id === t.categoryId);
  let next = t;
  if (!cat || !categoryAllowsType(cat, t.type)) {
    const s = suggestCategory(t.description, t.type, data);
    next = { ...next, categoryId: s.categoryId, categorySource: s.source };
  }
  if (next.type !== 'expense' && next.refund) next = { ...next, refund: undefined };
  if (next.type !== 'transfer' && (next.toAccountId || next.goalId)) next = { ...next, toAccountId: undefined, goalId: undefined };
  return next;
}

export function reducer(data: AppData, action: Action): AppData {
  switch (action.type) {
    case 'replace':
      return action.data;

    case 'startFresh': {
      const fresh = createEmptyData();
      return { ...fresh, meta: { ...fresh.meta, mode: 'user', onboarded: false } };
    }

    case 'finishOnboarding': {
      const p = action.payload;
      return {
        ...data,
        meta: { ...data.meta, mode: data.meta.mode === 'new' ? 'user' : data.meta.mode, onboarded: true },
        settings: { ...data.settings, userName: p.userName.trim(), currency: p.currency, monthlySavingsTarget: p.monthlySavingsTarget },
        accounts: data.accounts.map((a) =>
          a.kind === 'spending' && a.id === SPECIAL.mainAccount ? { ...a, openingBalance: p.spendingBalance }
          : a.kind === 'savings' && a.id === SPECIAL.savingsAccount ? { ...a, openingBalance: p.savingsBalance }
          : a,
        ),
        budgets: p.budgets.filter((b) => b.amount > 0),
      };
    }

    /* ---------- transactions ---------- */
    case 'addTx':
      return { ...data, transactions: [...data.transactions, normalizeTx(action.tx, data)] };

    case 'addTxs': {
      const existing = new Set(data.transactions.map((t) => t.id));
      const fresh = action.txs.filter((t) => !existing.has(t.id)).map((t) => normalizeTx(t, data));
      return fresh.length ? { ...data, transactions: [...data.transactions, ...fresh] } : data;
    }

    case 'updateTx': {
      const transactions = mapIds(data.transactions, new Set([action.id]), (t) => {
        let next: Transaction = { ...t, ...action.patch, id: t.id, updatedAt: now() };
        // Choosing a category by hand always makes it a manual choice.
        if (action.patch.categoryId !== undefined && action.patch.categorySource === undefined) next.categorySource = 'manual';
        // Editing the description of a still-automatic transaction lets the suggestion follow it.
        // A manual choice is never touched.
        const descChanged = action.patch.description !== undefined && action.patch.description !== t.description;
        if (descChanged && t.categorySource !== 'manual' && action.patch.categoryId === undefined && next.type !== 'transfer') {
          const s = suggestCategory(next.description, next.type, data);
          next = { ...next, categoryId: s.categoryId, categorySource: s.source };
        }
        return normalizeTx(next, data);
      });
      return transactions === data.transactions ? data : { ...data, transactions };
    }

    case 'deleteTxs': {
      const ids = new Set(action.ids);
      const transactions = data.transactions.filter((t) => !ids.has(t.id));
      return transactions.length === data.transactions.length ? data : { ...data, transactions };
    }

    case 'setCategory': {
      const cat = data.categories.find((c) => c.id === action.categoryId);
      if (!cat) return data;
      const transactions = mapIds(data.transactions, new Set(action.ids), (t) => {
        if (t.type === 'transfer' || !categoryAllowsType(cat, t.type)) return t;
        if (t.categoryId === cat.id && t.categorySource === 'manual') return t;
        return { ...t, categoryId: cat.id, categorySource: 'manual' as const, updatedAt: now() };
      });
      return transactions === data.transactions ? data : { ...data, transactions };
    }

    case 'confirmAuto': {
      const transactions = mapIds(data.transactions, new Set(action.ids), (t) =>
        t.categorySource === 'auto' || t.categorySource === 'rule' ? { ...t, categorySource: 'manual' as const, updatedAt: now() } : t,
      );
      return transactions === data.transactions ? data : { ...data, transactions };
    }

    /* ---------- categories & rules ---------- */
    case 'addCategory':
      return { ...data, categories: [...data.categories, action.category] };

    case 'updateCategory': {
      const categories = mapIds(data.categories, new Set([action.id]), (c) => ({
        ...c,
        icon: action.patch.icon ?? c.icon,
        color: action.patch.color ?? c.color,
        name: c.builtin ? c.name : (action.patch.name?.trim() || c.name),
      }));
      return { ...data, categories };
    }

    case 'deleteCategory': {
      const cat = data.categories.find((c) => c.id === action.id);
      if (!cat || cat.builtin || PROTECTED_CATEGORY_IDS.includes(cat.id)) return data;
      return {
        ...data,
        categories: data.categories.filter((c) => c.id !== cat.id),
        // Orphaned transactions go back to "Needs Your Attention" rather than silently landing somewhere.
        transactions: data.transactions.map((t) =>
          t.categoryId === cat.id ? { ...t, categoryId: SPECIAL.other, categorySource: 'none' as const, updatedAt: now() } : t,
        ),
        budgets: data.budgets.filter((b) => b.categoryId !== cat.id),
        rules: data.rules.filter((r) => r.categoryId !== cat.id),
        quickActions: data.quickActions.map((q) => (q.categoryId === cat.id ? { ...q, categoryId: SPECIAL.other } : q)),
      };
    }

    case 'addRule': {
      const rules = [...data.rules.filter((r) => r.pattern !== action.rule.pattern), action.rule];
      let transactions = data.transactions;
      if (action.applyToExisting) transactions = applyRuleToExisting(data.transactions, action.rule, data.categories).txs;
      return { ...data, rules, transactions };
    }

    case 'deleteRule':
      return { ...data, rules: data.rules.filter((r) => r.id !== action.id) };

    /* ---------- budgets ---------- */
    case 'setBudget': {
      const others = data.budgets.filter((b) => b.categoryId !== action.categoryId);
      return { ...data, budgets: action.amount > 0 ? [...others, { categoryId: action.categoryId, amount: action.amount }] : others };
    }

    /* ---------- goals ---------- */
    case 'addGoal':
      return { ...data, goals: [...data.goals, action.goal] };

    case 'updateGoal':
      return { ...data, goals: mapIds(data.goals, new Set([action.id]), (g) => ({ ...g, ...action.patch, id: g.id })) };

    case 'deleteGoal':
      return {
        ...data,
        goals: data.goals.filter((g) => g.id !== action.id),
        goalEntries: data.goalEntries.filter((e) => e.goalId !== action.id),
        // Money that was moved stays moved; the transfer just no longer points at a goal.
        transactions: data.transactions.map((t) => (t.goalId === action.id ? { ...t, goalId: undefined } : t)),
      };

    case 'addGoalEntry':
      return { ...data, goalEntries: [...data.goalEntries, action.entry] };

    case 'deleteGoalEntry':
      return { ...data, goalEntries: data.goalEntries.filter((e) => e.id !== action.id) };

    /* ---------- accounts ---------- */
    case 'addAccount':
      return { ...data, accounts: [...data.accounts, action.account] };

    case 'updateAccount':
      return {
        ...data,
        accounts: mapIds(data.accounts, new Set([action.id]), (a) => ({
          ...a,
          name: action.patch.name?.trim() || a.name,
          openingBalance: action.patch.openingBalance ?? a.openingBalance,
        })),
      };

    case 'deleteAccount': {
      const acc = data.accounts.find((a) => a.id === action.id);
      if (!acc) return data;
      const inUse = data.transactions.some((t) => t.accountId === acc.id || t.toAccountId === acc.id);
      const lastOfKind = data.accounts.filter((a) => a.kind === acc.kind).length <= 1 && acc.kind === 'spending';
      if (inUse || lastOfKind) return data;
      return { ...data, accounts: data.accounts.filter((a) => a.id !== acc.id) };
    }

    /* ---------- settings ---------- */
    case 'updateSettings':
      return { ...data, settings: { ...data.settings, ...action.patch } };

    case 'changeCurrency': {
      const from = currencyDecimals(data.settings.currency);
      const to = currencyDecimals(action.currency);
      const settings = { ...data.settings, currency: action.currency };
      if (from === to) return { ...data, settings };
      // Keep the nominal numbers (10.00 stays "10") when the number of decimals differs.
      const r = (n: number) => rescaleMinor(n, from, to);
      return {
        ...data,
        settings: { ...settings, monthlySavingsTarget: r(settings.monthlySavingsTarget) },
        accounts: data.accounts.map((a) => ({ ...a, openingBalance: r(a.openingBalance) })),
        transactions: data.transactions.map((t) => ({ ...t, amount: r(t.amount) })),
        budgets: data.budgets.map((b) => ({ ...b, amount: r(b.amount) })),
        goals: data.goals.map((g) => ({ ...g, target: r(g.target), startingAmount: r(g.startingAmount) })),
        goalEntries: data.goalEntries.map((e) => ({ ...e, amount: r(e.amount) })),
        quickActions: data.quickActions.map((q) => (q.amount ? { ...q, amount: r(q.amount) } : q)),
      };
    }

    case 'dismissNotice':
      return data.settings.dismissedNotifications.includes(action.id)
        ? data
        : { ...data, settings: { ...data.settings, dismissedNotifications: [...data.settings.dismissedNotifications, action.id].slice(-200) } };

    case 'resetNotices':
      return { ...data, settings: { ...data.settings, dismissedNotifications: [] } };

    case 'addQuickAction':
      return { ...data, quickActions: [...data.quickActions, action.action] };

    case 'deleteQuickAction':
      return { ...data, quickActions: data.quickActions.filter((q) => q.id !== action.id) };

    /* ---------- demo & reset ---------- */
    case 'clearDemo': {
      const demoGoalIds = new Set(data.goals.filter((g) => g.isDemo).map((g) => g.id));
      const transactions = data.transactions.filter((t) => !t.isDemo).map((t) => (t.goalId && demoGoalIds.has(t.goalId) ? { ...t, goalId: undefined } : t));
      return {
        ...data,
        meta: { ...data.meta, mode: 'user', onboarded: transactions.length > 0 },
        settings: { ...data.settings, monthlySavingsTarget: 0, dismissedNotifications: [] },
        accounts: data.accounts.map((a) => (a.isDemo ? { ...a, openingBalance: 0, isDemo: undefined } : a)),
        transactions,
        goals: data.goals.filter((g) => !g.isDemo),
        goalEntries: data.goalEntries.filter((e) => !e.isDemo && !demoGoalIds.has(e.goalId)),
        budgets: [],
      };
    }

    case 'eraseAll':
      return createEmptyData();
  }
}
