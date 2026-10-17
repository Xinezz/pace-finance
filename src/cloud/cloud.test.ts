import { describe, expect, it } from 'vitest';
import { createDemoData } from '../domain/demo';
import { createEmptyData } from '../domain/defaults';
import { reducer } from '../state/reducer';
import { ConflictError } from '../storage/dataStore';
import { CloudDataStore } from './cloudStore';
import { createMockCloud, type KeyValueStorage } from './mockCloud';

/** A throwaway in-memory Storage so each test gets its own pretend browser. */
function memoryStorage(): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

async function signedUp(cloud = createMockCloud(memoryStorage()), email = 'sam@example.com', password = 'a-long-enough-password') {
  const res = await cloud.signUp(email, password);
  expect(res.ok).toBe(true);
  const user = await cloud.getUser();
  expect(user).not.toBeNull();
  return { cloud, user: user!, email, password };
}

describe('accounts', () => {
  it('signs up, signs out and signs back in', async () => {
    const { cloud, email, password } = await signedUp();
    await cloud.signOut();
    expect(await cloud.getUser()).toBeNull();
    expect((await cloud.signIn(email, password)).ok).toBe(true);
    expect((await cloud.getUser())?.email).toBe(email);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const { cloud, email } = await signedUp();
    await cloud.signOut();
    const wrongPassword = await cloud.signIn(email, 'not-the-password');
    const unknownEmail = await cloud.signIn('nobody@example.com', 'whatever-it-is');
    expect(wrongPassword.ok).toBe(false);
    expect(unknownEmail.ok).toBe(false);
    expect(wrongPassword.error).toBe(unknownEmail.error);
  });

  it('does not reveal whether an email is already registered when signing up', async () => {
    const { cloud } = await signedUp();
    await cloud.signOut();
    const again = await cloud.signUp('sam@example.com', 'a-different-password');
    expect(again).toEqual({ ok: true, needsEmailConfirmation: true });
    expect(await cloud.getUser()).toBeNull(); // and it certainly didn't sign anyone in
  });

  it('can require the email to be confirmed before signing in', async () => {
    const cloud = createMockCloud(memoryStorage(), { requireEmailConfirmation: true });
    expect(await cloud.signUp('new@example.com', 'a-long-enough-password')).toEqual({ ok: true, needsEmailConfirmation: true });
    expect(await cloud.getUser()).toBeNull();
    const early = await cloud.signIn('new@example.com', 'a-long-enough-password');
    expect(early.ok).toBe(false);
    expect(early.error).toMatch(/confirm your email/i);
    cloud.debug.confirmEmail('new@example.com');
    expect((await cloud.signIn('new@example.com', 'a-long-enough-password')).ok).toBe(true);
  });

  it('changes the password, and the old one stops working', async () => {
    const { cloud, email, password } = await signedUp();
    expect((await cloud.updatePassword('a-brand-new-password')).ok).toBe(true);
    await cloud.signOut();
    expect((await cloud.signIn(email, password)).ok).toBe(false);
    expect((await cloud.signIn(email, 'a-brand-new-password')).ok).toBe(true);
  });

  it('refuses to change a password when nobody is signed in', async () => {
    const cloud = createMockCloud(memoryStorage());
    expect((await cloud.updatePassword('a-long-enough-password')).ok).toBe(false);
  });

  it('tells listeners when someone signs in and out', async () => {
    const cloud = createMockCloud(memoryStorage());
    const events: string[] = [];
    const off = cloud.onAuthChange((e) => events.push(e));
    await cloud.signUp('a@example.com', 'a-long-enough-password');
    await cloud.signOut();
    off();
    await cloud.signIn('a@example.com', 'a-long-enough-password');
    expect(events).toEqual(['signed-in', 'signed-out']);
  });
});

describe('private data per account', () => {
  it("keeps one person's data out of another person's account", async () => {
    const storage = memoryStorage();
    const cloud = createMockCloud(storage);

    const a = await signedUp(cloud, 'alice@example.com');
    const aliceStore = new CloudDataStore(cloud.gatewayFor(a.user));
    await aliceStore.save(createDemoData('2026-10-15'));
    await cloud.signOut();

    const b = await signedUp(cloud, 'bob@example.com');
    const bobStore = new CloudDataStore(cloud.gatewayFor(b.user));
    expect(await bobStore.load()).toBeNull(); // Bob starts empty and sees nothing of Alice's
    await bobStore.save(reducer(createEmptyData(), { type: 'startFresh' }));

    // Alice's data is still hers, and different from Bob's.
    await cloud.signOut();
    await cloud.signIn('alice@example.com', a.password);
    const aliceAgain = await new CloudDataStore(cloud.gatewayFor(a.user)).load();
    expect(aliceAgain?.transactions.length).toBeGreaterThan(100);
    expect(aliceAgain?.meta.mode).toBe('demo');
  });

  it('cannot write to an account that is not the signed-in one', async () => {
    const cloud = createMockCloud(memoryStorage());
    const a = await signedUp(cloud, 'alice@example.com');
    await cloud.signOut();
    await signedUp(cloud, 'bob@example.com'); // Bob is now signed in
    const aliceViaBob = new CloudDataStore(cloud.gatewayFor(a.user));
    await expect(aliceViaBob.save(createEmptyData())).rejects.toThrow(/not signed in/i);
  });

  it('deleting an account erases its login and its data', async () => {
    const storage = memoryStorage();
    const cloud = createMockCloud(storage);
    const { user, email, password } = await signedUp(cloud);
    await new CloudDataStore(cloud.gatewayFor(user)).save(createDemoData('2026-10-15'));
    expect((await cloud.deleteAccount()).ok).toBe(true);
    expect(await cloud.getUser()).toBeNull();
    expect((await cloud.signIn(email, password)).ok).toBe(false);
    expect(Object.keys(cloud.debug.readDb().docs)).toHaveLength(0);
  });
});

describe('CloudDataStore', () => {
  it('starts empty for a new account', async () => {
    const { cloud, user } = await signedUp();
    expect(await new CloudDataStore(cloud.gatewayFor(user)).load()).toBeNull();
  });

  it('round-trips the whole document without losing anything', async () => {
    const { cloud, user } = await signedUp();
    const demo = createDemoData('2026-10-15');
    const store = new CloudDataStore(cloud.gatewayFor(user));
    await store.save(demo);
    const loaded = await new CloudDataStore(cloud.gatewayFor(user)).load();
    expect(loaded?.transactions).toHaveLength(demo.transactions.length);
    expect(loaded?.goals).toEqual(demo.goals);
    expect(loaded?.budgets).toEqual(demo.budgets);
    expect(loaded?.transactions.map((t) => t.amount)).toEqual(demo.transactions.map((t) => t.amount));
  });

  it('refuses to overwrite a newer copy saved from another device', async () => {
    const { cloud, user } = await signedUp();
    const laptop = new CloudDataStore(cloud.gatewayFor(user));
    const phone = new CloudDataStore(cloud.gatewayFor(user));
    await laptop.load();
    await phone.load();

    await laptop.save(createDemoData('2026-10-15')); // laptop saves first (v1)
    await expect(phone.save(createEmptyData())).rejects.toBeInstanceOf(ConflictError); // phone is now stale

    // Nothing was lost: the laptop's data is still there.
    expect((await new CloudDataStore(cloud.gatewayFor(user)).load())?.meta.mode).toBe('demo');
  });

  it('reports the remote version so the person can choose what to keep', async () => {
    const { cloud, user } = await signedUp();
    const a = new CloudDataStore(cloud.gatewayFor(user));
    const b = new CloudDataStore(cloud.gatewayFor(user));
    await a.save(createEmptyData());
    await a.save(createEmptyData());
    const err = await b.save(createEmptyData()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).remoteVersion).toBe(2);
  });

  it('can deliberately overwrite after a conflict', async () => {
    const { cloud, user } = await signedUp();
    const a = new CloudDataStore(cloud.gatewayFor(user));
    const b = new CloudDataStore(cloud.gatewayFor(user));
    await a.save(createDemoData('2026-10-15'));
    const err = (await b.save(createEmptyData()).catch((e: unknown) => e)) as ConflictError;
    b.acceptRemote(err.remoteVersion);
    await b.save(reducer(createEmptyData(), { type: 'startFresh' }));
    expect((await new CloudDataStore(cloud.gatewayFor(user)).load())?.meta.mode).toBe('user');
  });

  it('can pick up the latest copy instead (reload)', async () => {
    const { cloud, user } = await signedUp();
    const a = new CloudDataStore(cloud.gatewayFor(user));
    const b = new CloudDataStore(cloud.gatewayFor(user));
    await a.save(createDemoData('2026-10-15'));
    await expect(b.save(createEmptyData())).rejects.toBeInstanceOf(ConflictError);
    expect((await b.load())?.meta.mode).toBe('demo');
    await b.save(createDemoData('2026-10-15')); // after reloading, saving works again
  });

  it('repairs malformed stored data instead of crashing the app', async () => {
    const { cloud, user } = await signedUp();
    const db = cloud.debug.readDb();
    db.docs[user.id] = { version: 1, data: { ...createDemoData('2026-10-15'), transactions: [{ id: 'x', amount: -1, type: 'expense', date: 'nope' }, 'junk'] } };
    cloud.debug.writeDb(db);
    const loaded = await new CloudDataStore(cloud.gatewayFor(user)).load();
    expect(loaded?.transactions).toEqual([]);
  });

  it('clear() removes the cloud copy', async () => {
    const { cloud, user } = await signedUp();
    const store = new CloudDataStore(cloud.gatewayFor(user));
    await store.save(createEmptyData());
    await store.clear();
    expect(await new CloudDataStore(cloud.gatewayFor(user)).load()).toBeNull();
  });
});
