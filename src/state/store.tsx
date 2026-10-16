import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { crossedMilestone, goalProgress, goalSaved } from '../domain/calc';
import { todayStr } from '../domain/dates';
import { createEmptyData } from '../domain/defaults';
import { formatMoney, type FormatMoneyOptions } from '../domain/money';
import type { AppData } from '../domain/types';
import { createBestStore, type DataStore, type StoreKind } from '../storage/dataStore';
import { reducer, type Action } from './reducer';

export type SaveState = 'saved' | 'saving' | 'error';

export interface Celebration {
  id: number;
  goalName: string;
  icon: string;
  milestone: number;
}

export interface DispatchOptions {
  /** Remember the previous state so the user can undo this change. */
  undoable?: boolean;
}

interface StoreApi {
  data: AppData;
  ready: boolean;
  loadError: string | null;
  dispatch: (action: Action, opts?: DispatchOptions) => void;
  undo: () => boolean;
  canUndo: boolean;
  saveState: SaveState;
  storeKind: StoreKind | null;
  storeNotice: string | null;
  today: string;
  celebration: Celebration | null;
  clearCelebration: () => void;
  /** Wipe the persisted copy as well (used by "erase everything"). */
  eraseStorage: () => Promise<void>;
}

const StoreContext = createContext<StoreApi | null>(null);

/** Actions after which a goal crossing 25/50/75/100% deserves a little celebration. */
const CELEBRATE_ON = new Set<Action['type']>(['addTx', 'updateTx', 'addGoalEntry']);

function goalPcts(data: AppData, today: string): Map<string, number | null> {
  return new Map(data.goals.map((g) => [g.id, goalProgress(g, goalSaved(g, data.goalEntries, data.transactions, data.accounts), today).pct]));
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => createEmptyData());
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [storeKind, setStoreKind] = useState<StoreKind | null>(null);
  const [storeNotice, setStoreNotice] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [today, setToday] = useState(() => todayStr());

  const dataRef = useRef(data);
  const storeRef = useRef<DataStore | null>(null);
  const persistedRef = useRef<AppData | null>(null);
  const undoRef = useRef<AppData | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const celebrationId = useRef(0);

  /* ---------- load ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { store, notice } = await createBestStore();
        const loaded = await store.load();
        if (cancelled) return;
        storeRef.current = store;
        setStoreKind(store.kind);
        setStoreNotice(notice ?? null);
        if (loaded) {
          dataRef.current = loaded;
          persistedRef.current = loaded;
          setData(loaded);
        }
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : 'Could not open your saved data.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- keep "today" correct across midnight ---------- */
  useEffect(() => {
    const id = window.setInterval(() => setToday((t) => (t === todayStr() ? t : todayStr())), 60_000);
    return () => window.clearInterval(id);
  }, []);

  /* ---------- persistence ---------- */
  const flush = useCallback(() => {
    const store = storeRef.current;
    if (!store) return;
    chainRef.current = chainRef.current.then(async () => {
      const target = dataRef.current;
      if (target === persistedRef.current) return;
      try {
        await store.save(target, persistedRef.current);
        persistedRef.current = target;
        if (dataRef.current === target) setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    });
  }, []);

  useEffect(() => {
    if (!ready || data === persistedRef.current) return;
    setSaveState('saving');
    const t = window.setTimeout(flush, 250);
    return () => window.clearTimeout(t);
  }, [data, ready, flush]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  /* ---------- theme ---------- */
  const theme = data.settings.theme;
  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#151a16' : '#F8F6F0');
    };
    apply();
    try {
      localStorage.setItem('pace:theme', theme);
    } catch {
      /* storage may be blocked; theme still works for this session */
    }
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  /* ---------- dispatch ---------- */
  const dispatch = useCallback((action: Action, opts?: DispatchOptions) => {
    const prev = dataRef.current;
    const next = reducer(prev, action);
    if (next === prev) return;
    dataRef.current = next;
    if (opts?.undoable) {
      undoRef.current = prev;
      setCanUndo(true);
    }
    setData(next);

    if (CELEBRATE_ON.has(action.type) && next.goals.length > 0) {
      const t = todayStr();
      const before = goalPcts(prev, t);
      const after = goalPcts(next, t);
      for (const g of next.goals) {
        const hit = crossedMilestone(before.get(g.id) ?? null, after.get(g.id) ?? null);
        if (hit) {
          setCelebration({ id: ++celebrationId.current, goalName: g.name, icon: g.icon, milestone: hit });
          break;
        }
      }
    }
  }, []);

  const undo = useCallback(() => {
    const prev = undoRef.current;
    if (!prev) return false;
    undoRef.current = null;
    setCanUndo(false);
    dataRef.current = prev;
    setData(prev);
    return true;
  }, []);

  const eraseStorage = useCallback(async () => {
    await storeRef.current?.clear();
    persistedRef.current = null;
  }, []);

  const value = useMemo<StoreApi>(
    () => ({
      data,
      ready,
      loadError,
      dispatch,
      undo,
      canUndo,
      saveState,
      storeKind,
      storeNotice,
      today,
      celebration,
      clearCelebration: () => setCelebration(null),
      eraseStorage,
    }),
    [data, ready, loadError, dispatch, undo, canUndo, saveState, storeKind, storeNotice, today, celebration, eraseStorage],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

export function useData(): AppData {
  return useStore().data;
}

/** Currency-aware formatter bound to the user's chosen currency. */
export function useMoney() {
  const currency = useStore().data.settings.currency;
  return useMemo(
    () => ({
      currency,
      fmt: (minor: number, opts?: FormatMoneyOptions) => formatMoney(minor, currency, opts),
    }),
    [currency],
  );
}
