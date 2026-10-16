/**
 * Persistence layer. The app talks only to the `DataStore` interface, so swapping IndexedDB for a
 * real backend (with authentication) later means writing one new class, not touching any UI.
 *
 *  - IndexedDbStore:    the default. One object store per collection; saves write only what changed.
 *  - LocalStorageStore: fallback if IndexedDB is unavailable.
 *  - MemoryStore:       last resort (private windows that block all storage). Data won't survive a reload,
 *                       and the UI says so.
 */
import { SCHEMA_VERSION, type AppData } from '../domain/types';
import { sanitizeAppData } from './sanitize';

export type StoreKind = 'indexeddb' | 'localstorage' | 'memory';

export interface DataStore {
  readonly kind: StoreKind;
  /** Resolves null on first run (nothing stored yet). */
  load(): Promise<AppData | null>;
  /** `prev` is what was last persisted, so implementations can write only the difference. */
  save(next: AppData, prev: AppData | null): Promise<void>;
  clear(): Promise<void>;
}

/* ------------------------------------------------------------------ */

const DB_NAME = 'pace-finance';
const DB_VERSION = 1;

type CollectionKey = 'accounts' | 'categories' | 'transactions' | 'budgets' | 'goals' | 'goalEntries' | 'rules' | 'quickActions';
const COLLECTIONS: { name: CollectionKey; keyPath: string }[] = [
  { name: 'accounts', keyPath: 'id' },
  { name: 'categories', keyPath: 'id' },
  { name: 'transactions', keyPath: 'id' },
  { name: 'budgets', keyPath: 'categoryId' },
  { name: 'goals', keyPath: 'id' },
  { name: 'goalEntries', keyPath: 'id' },
  { name: 'rules', keyPath: 'id' },
  { name: 'quickActions', keyPath: 'id' },
];

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export class IndexedDbStore implements DataStore {
  readonly kind = 'indexeddb' as const;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly name = DB_NAME) {}

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.name, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('app')) db.createObjectStore('app');
          for (const c of COLLECTIONS) {
            if (!db.objectStoreNames.contains(c.name)) db.createObjectStore(c.name, { keyPath: c.keyPath });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Could not open the local database'));
        request.onblocked = () => reject(new Error('The local database is blocked by another tab'));
      });
    }
    return this.dbPromise;
  }

  async load(): Promise<AppData | null> {
    const db = await this.open();
    const tx = db.transaction(['app', ...COLLECTIONS.map((c) => c.name)], 'readonly');
    const appRec = (await req(tx.objectStore('app').get('state'))) as { meta: unknown; settings: unknown } | undefined;
    if (!appRec) return null;
    const raw: Record<string, unknown> = { meta: appRec.meta, settings: appRec.settings };
    for (const c of COLLECTIONS) raw[c.name] = await req(tx.objectStore(c.name).getAll());
    const { data } = sanitizeAppData(raw);
    return data;
  }

  async save(next: AppData, prev: AppData | null): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(['app', ...COLLECTIONS.map((c) => c.name)], 'readwrite');
    const done = txDone(tx);
    if (!prev || prev.meta !== next.meta || prev.settings !== next.settings) {
      tx.objectStore('app').put({ meta: next.meta, settings: next.settings, schemaVersion: SCHEMA_VERSION }, 'state');
    }
    for (const c of COLLECTIONS) {
      const store = tx.objectStore(c.name);
      const nextList = next[c.name] as unknown as Record<string, unknown>[];
      const prevList = (prev ? prev[c.name] : []) as unknown as Record<string, unknown>[];
      if (prev && prevList === nextList) continue;
      const prevMap = new Map(prevList.map((x) => [String(x[c.keyPath]), x]));
      const nextKeys = new Set<string>();
      for (const item of nextList) {
        const key = String(item[c.keyPath]);
        nextKeys.add(key);
        if (prevMap.get(key) !== item) store.put(item);
      }
      for (const key of prevMap.keys()) if (!nextKeys.has(key)) store.delete(key);
    }
    await done;
  }

  async clear(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(['app', ...COLLECTIONS.map((c) => c.name)], 'readwrite');
    const done = txDone(tx);
    tx.objectStore('app').clear();
    for (const c of COLLECTIONS) tx.objectStore(c.name).clear();
    await done;
  }

  close(): void {
    this.dbPromise?.then((db) => db.close()).catch(() => undefined);
    this.dbPromise = null;
  }
}

/* ------------------------------------------------------------------ */

const LS_KEY = 'pace:data:v1';

export class LocalStorageStore implements DataStore {
  readonly kind = 'localstorage' as const;

  async load(): Promise<AppData | null> {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return sanitizeAppData(JSON.parse(raw)).data;
  }

  async save(next: AppData): Promise<void> {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  }

  async clear(): Promise<void> {
    localStorage.removeItem(LS_KEY);
  }
}

export class MemoryStore implements DataStore {
  readonly kind = 'memory' as const;
  private saved: AppData | null = null;
  async load(): Promise<AppData | null> {
    return this.saved;
  }
  async save(next: AppData): Promise<void> {
    this.saved = next;
  }
  async clear(): Promise<void> {
    this.saved = null;
  }
}

/** Pick the best available store. Probes each with a real write so we don't discover a problem later. */
export async function createBestStore(): Promise<{ store: DataStore; notice?: string }> {
  try {
    if (typeof indexedDB !== 'undefined') {
      const idb = new IndexedDbStore();
      await idb.load();
      return { store: idb };
    }
  } catch {
    /* fall through */
  }
  try {
    const key = 'pace:probe';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return { store: new LocalStorageStore(), notice: 'Your browser blocked IndexedDB, so Pace is using localStorage instead.' };
  } catch {
    /* fall through */
  }
  return { store: new MemoryStore(), notice: "This browser is blocking all storage, so changes will be lost when you close the tab. Export a backup from Settings to keep your data." };
}
