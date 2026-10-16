/** Navigation (hash routing), the month being viewed, and app-wide modals such as quick-add. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { addMonths, currentMonthKey, type MonthKey } from '../domain/dates';
import type { Transaction } from '../domain/types';

export const PAGES = ['dashboard', 'transactions', 'analytics', 'budgets', 'savings', 'calendar', 'reports', 'settings'] as const;
export type Page = (typeof PAGES)[number];

export interface Route {
  page: Page;
  params: URLSearchParams;
}

function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/dashboard';
  const [path, query = ''] = raw.split('?');
  const seg = path.replace(/^\//, '').split('/')[0] as Page;
  return { page: (PAGES as readonly string[]).includes(seg) ? seg : 'dashboard', params: new URLSearchParams(query) };
}

export interface TxModalState {
  mode: 'add' | 'edit';
  id?: string;
  prefill?: Partial<Transaction>;
}

interface UiApi {
  route: Route;
  navigate: (to: string) => void;
  month: MonthKey;
  setMonth: (m: MonthKey) => void;
  shiftMonth: (n: number) => void;
  goToCurrentMonth: () => void;
  txModal: TxModalState | null;
  openAddTx: (prefill?: Partial<Transaction>) => void;
  openEditTx: (id: string) => void;
  closeTxModal: () => void;
  categorizeIds: string[] | 'all-needing' | null;
  openCategorize: (ids?: string[]) => void;
  closeCategorize: () => void;
}

const UiContext = createContext<UiApi | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [month, setMonth] = useState<MonthKey>(() => currentMonthKey());
  const [txModal, setTxModal] = useState<TxModalState | null>(null);
  const [categorizeIds, setCategorizeIds] = useState<string[] | 'all-needing' | null>(null);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((to: string) => {
    const next = to.startsWith('#') ? to : `#${to.startsWith('/') ? to : `/${to}`}`;
    if (window.location.hash === next) setRoute(parseHash(next));
    else window.location.hash = next;
  }, []);

  const value = useMemo<UiApi>(
    () => ({
      route,
      navigate,
      month,
      setMonth,
      shiftMonth: (n) => setMonth((m) => addMonths(m, n)),
      goToCurrentMonth: () => setMonth(currentMonthKey()),
      txModal,
      openAddTx: (prefill) => setTxModal({ mode: 'add', prefill }),
      openEditTx: (id) => setTxModal({ mode: 'edit', id }),
      closeTxModal: () => setTxModal(null),
      categorizeIds,
      openCategorize: (ids) => setCategorizeIds(ids && ids.length ? ids : 'all-needing'),
      closeCategorize: () => setCategorizeIds(null),
    }),
    [route, navigate, month, txModal, categorizeIds],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiApi {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used inside <UiProvider>');
  return ctx;
}
