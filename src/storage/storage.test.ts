import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoData } from '../domain/demo';
import { tx } from '../domain/testUtils';
import { createEmptyData } from '../domain/defaults';
import { SPECIAL } from '../domain/types';
import { reducer } from '../state/reducer';
import { IndexedDbStore, MemoryStore } from './dataStore';
import { createBackup, parseBackup, sanitizeAppData } from './sanitize';

let n = 0;
let store: IndexedDbStore;
beforeEach(() => {
  store = new IndexedDbStore(`test-db-${n++}`);
});

describe('IndexedDbStore', () => {
  it('returns null on first run', async () => {
    expect(await store.load()).toBeNull();
  });

  it('persists and reloads data across "sessions"', async () => {
    const data = createDemoData('2026-10-15');
    await store.save(data, null);
    store.close();
    const reopened = new IndexedDbStore((store as unknown as { name: string }).name);
    const loaded = await reopened.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.transactions).toHaveLength(data.transactions.length);
    expect(loaded!.goals).toHaveLength(data.goals.length);
    expect(loaded!.meta.mode).toBe('demo');
    expect(loaded!.settings.currency).toBe('SGD');
  });

  it('writes edits, additions and deletions as a diff', async () => {
    let data = createDemoData('2026-10-15');
    await store.save(data, null);
    const prev = data;
    const target = data.transactions[0];
    data = reducer(data, { type: 'updateTx', id: target.id, patch: { notes: 'edited' } });
    data = reducer(data, { type: 'deleteTxs', ids: [data.transactions[1].id] });
    data = reducer(data, { type: 'addTx', tx: tx({ id: 'brand-new', amount: 123, date: '2026-10-14', description: 'New thing' }) });
    await store.save(data, prev);
    const loaded = (await store.load())!;
    expect(loaded.transactions.find((t) => t.id === target.id)?.notes).toBe('edited');
    expect(loaded.transactions.find((t) => t.id === 'brand-new')).toBeTruthy();
    expect(loaded.transactions).toHaveLength(data.transactions.length);
  });

  it('keeps custom categories, budgets and settings', async () => {
    let data = createEmptyData();
    data = reducer(data, { type: 'addCategory', category: { id: 'pets', name: 'Pets', icon: '🐶', color: '#A8B5A0', type: 'expense', builtin: false } });
    data = reducer(data, { type: 'setBudget', categoryId: 'pets', amount: 5000 });
    data = reducer(data, { type: 'updateSettings', patch: { theme: 'dark', userName: 'Sam' } });
    await store.save(data, null);
    const loaded = (await store.load())!;
    expect(loaded.categories.find((c) => c.id === 'pets')?.name).toBe('Pets');
    expect(loaded.budgets).toEqual([{ categoryId: 'pets', amount: 5000 }]);
    expect(loaded.settings).toMatchObject({ theme: 'dark', userName: 'Sam' });
  });

  it('clear() wipes everything', async () => {
    await store.save(createDemoData('2026-10-15'), null);
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});

describe('MemoryStore', () => {
  it('round-trips in memory', async () => {
    const m = new MemoryStore();
    const d = createEmptyData();
    await m.save(d);
    expect(await m.load()).toBe(d);
  });
});

describe('backup & restore', () => {
  it('round-trips through a JSON backup without losing anything', () => {
    const data = createDemoData('2026-10-15');
    const text = JSON.stringify(createBackup(data));
    const { data: restored, warnings } = parseBackup(text);
    expect(warnings).toEqual([]);
    expect(restored.transactions).toHaveLength(data.transactions.length);
    expect(restored.goals).toEqual(data.goals);
    expect(restored.budgets).toEqual(data.budgets);
    expect(restored.accounts).toEqual(data.accounts);
    expect(restored.transactions.map((t) => t.amount)).toEqual(data.transactions.map((t) => t.amount));
  });

  it('rejects files that are not Pace backups', () => {
    expect(() => parseBackup('not json')).toThrow(/valid JSON/);
    expect(() => parseBackup('{"hello":1}')).toThrow(/Pace backup/);
    expect(() => parseBackup(JSON.stringify({ app: 'pace-finance', version: 99, data: {} }))).toThrow(/newer version/);
  });

  it('drops invalid rows and repairs dangling references instead of crashing', () => {
    const base = createDemoData('2026-10-15');
    const good = base.transactions[0];
    const bad = [
      { ...good, id: 'neg', amount: -5 },
      { ...good, id: 'frac', amount: 12.4 },
      { ...good, id: 'baddate', date: '2026-02-31' },
      { ...good, id: 'badtype', type: 'gift' },
      { ...good, id: 'ghostcat', categoryId: 'nope', categorySource: 'manual' },
      { ...good, id: 'ghostacc', accountId: 'nope' },
      'garbage',
      null,
    ];
    const { data, warnings } = sanitizeAppData({ ...base, transactions: [good, ...bad] });
    const ids = data.transactions.map((t) => t.id);
    expect(ids).toContain(good.id);
    expect(ids).toContain('frac'); // repaired by rounding
    expect(ids).toContain('ghostcat');
    expect(ids).toContain('ghostacc');
    expect(ids).not.toContain('neg');
    expect(ids).not.toContain('baddate');
    expect(ids).not.toContain('badtype');
    expect(data.transactions.find((t) => t.id === 'ghostcat')).toMatchObject({ categoryId: 'other', categorySource: 'none' });
    expect(data.transactions.find((t) => t.id === 'ghostacc')?.accountId).toBe(SPECIAL.mainAccount);
    expect(warnings.join(' ')).toMatch(/Skipped 5 invalid transactions/);
  });

  it('always keeps the built-in categories', () => {
    const { data } = sanitizeAppData({ categories: [] });
    expect(data.categories.map((c) => c.id)).toContain('other');
    expect(data.accounts.some((a) => a.kind === 'spending')).toBe(true);
  });
});
