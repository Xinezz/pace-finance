import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { crossedMilestone, goalProgress, goalSaved } from '../domain/calc';
import { todayStr } from '../domain/dates';
import { createEmptyData } from '../domain/defaults';
import { formatMoney, type FormatMoneyOptions } from '../domain/money';
import type { AppData } from '../domain/types';
import { ConflictError, createBestStore, type DataStore, type StoreKind } from '../storage/dataStore';
import { reducer, type Action } from './reducer';

export type SaveState = 'saved' | 'saving' | 'error' | 'conflict';

/** Opens the store this provider reads from and saves to. Defaults to the on-device store. */
export type StoreLoader = () => Promise<{ store: DataStore; notice?: string }>;

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
  /** Set when the cloud copy changed on another device since this one loaded it. */
  conflict: { remoteVersion: number } | null;
  resolveConflict: (choice: 'reload' | 'overwrite') => Promise<void>;
  /** Data found on this device when a brand-new account is empty: offered once for import. */
  localCopy: AppData | null;
  adoptLocalCopy: () => void;
  dismissLocalCopy: () => void;
}

const StoreContext = createContext<StoreApi | null>(null);

/** Actions after which a goal crossing 25/50/75/100% deserves a little celebration. */
const CELEBRATE_ON = new Set<Action['type']>(['addTx', 'updateTx', 'addGoalEntry']);

/** How long to wait before retrying a failed save (for example when offline). */
const RETRY_MS = 15_000;

function goalPcts(data: AppData, today: string): Map<string, number | null> {
  return new Map(data.goals.map((g) => [g.id, goalProgress(g, goalSaved(g, data.goalEntries, data.transactions, data.accounts), today).pct]));
}

interface StoreProviderProps {
  children: ReactNode;
  loader?: StoreLoader;
  /** For a signed-in account with no saved data yet: look for data on this device to offer importing. */
  offerLocalImport?: boolean;
}

export function StoreProvider({ children, loader, offerLocalImport }: StoreProviderProps) {
  // The untouched starting state is never saved: until the person does something there is nothing to keep.
  const [initialData] = useState<AppData>(() => createEmptyData());
  const [data, setData] = useState<AppData>(initialData);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [storeKind, setStoreKind] = useState<StoreKind | null>(null);
  const [storeNotice, setStoreNotice] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [today, setToday] = useState(() => todayStr());
  const [conflict, setConflict] = useState<{ remoteVersion: number } | null>(null);
  const [localCopy, setLocalCopy] = useState<AppData | null>(null);

  const dataRef = useRef(data);
  const storeRef = useRef<DataStore | null>(null);
  const persistedRef = useRef<AppData | null>(null);
  const undoRef = useRef<AppData | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const celebrationId = useRef(0);
  const conflictRef = useRef<{ remoteVersion: number } | null>(null);
  const retryRef = useRef<number | null>(null);
  const flushRef = useRef<() => void>(() => undefined);
  // The loader is read once, at mount: a different account gets a different provider instance (see App).
  const loaderRef = useRef<StoreLoader>(loader ?? createBestStore);
  const offerImportRef = useRef(!!offerLocalImport);

  /* ---------- load ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { store, notice } = await loaderRef.current();
        const loaded = await store.load();
        let offered: AppData | null = null;
        if ((!loaded || loaded.meta.mode === 'new') && offerImportRef.current) {
          try {
            const { store: local } = await createBestStore();
            const copy = await local.load();
            if (copy && copy.meta.mode !== 'new') offered = copy;
          } catch {
            /* nothing on this device to offer */
          }
        }
        if (cancelled) return;
        storeRef.current = store;
        setStoreKind(store.kind);
        setStoreNotice(notice ?? null);
        setLocalCopy(offered);
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
    if (!store || conflictRef.current) return;
    chainRef.current = chainRef.current.then(async () => {
      const target = dataRef.current;
      if (target === persistedRef.current || target === initialData || conflictRef.current) return;
      try {
        await store.save(target, persistedRef.current);
        persistedRef.current = target;
        if (dataRef.current === target) setSaveState('saved');
      } catch (e) {
        if (e instanceof ConflictError) {
          // Another device saved first. Stop auto-saving and let the person choose what to keep.
          conflictRef.current = { remoteVersion: e.remoteVersion };
          setConflict(conflictRef.current);
          setSaveState('conflict');
          return;
        }
        setSaveState('error');
        if (retryRef.current === null) {
          retryRef.current = window.setTimeout(() => {
            retryRef.current = null;
            flushRef.current();
          }, RETRY_MS);
        }
      }
    });
  }, [initialData]);
  flushRef.current = flush;

  useEffect(() => {
    if (!ready || data === persistedRef.current || data === initialData || conflictRef.current) return;
    setSaveState('saving');
    const t = window.setTimeout(flush, 250);
    return () => window.clearTimeout(t);
  }, [data, ready, flush, initialData]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const onOnline = () => flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('online', onOnline);
      if (retryRef.current !== null) window.clearTimeout(retryRef.current);
    };
  }, [flush]);

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

  const resolveConflict = useCallback(
    async (choice: 'reload' | 'overwrite') => {
      const store = storeRef.current;
      const pending = conflictRef.current;
      if (!store || !pending) return;
      if (choice === 'overwrite') {
        store.acceptRemote?.(pending.remoteVersion);
        conflictRef.current = null;
        setConflict(null);
        setSaveState('saving');
        flush();
        return;
      }
      // Throws if the network fails; the dialog stays open and shows the problem.
      const fresh = await store.load();
      const next = fresh ?? createEmptyData();
      dataRef.current = next;
      persistedRef.current = fresh;
      undoRef.current = null;
      setCanUndo(false);
      setData(next);
      conflictRef.current = null;
      setConflict(null);
      setSaveState('saved');
    },
    [flush],
  );

  const adoptLocalCopy = useCallback(() => {
    if (!localCopy) return;
    dispatch({ type: 'replace', data: localCopy });
    setLocalCopy(null);
  }, [localCopy, dispatch]);

  const dismissLocalCopy = useCallback(() => setLocalCopy(null), []);

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
      conflict,
      resolveConflict,
      localCopy,
      adoptLocalCopy,
      dismissLocalCopy,
    }),
    [data, ready, loadError, dispatch, undo, canUndo, saveState, storeKind, storeNotice, today, celebration, eraseStorage, conflict, resolveConflict, localCopy, adoptLocalCopy, dismissLocalCopy],
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
