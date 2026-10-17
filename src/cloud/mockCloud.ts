/**
 * A pretend accounts backend that lives entirely in the browser's storage.
 *
 * !! DEVELOPMENT ONLY. It offers NO real security: anyone with this browser can read it. !!
 * It exists so the sign-in screens, per-user separation and conflict handling can be built and tested
 * without a Supabase project. It is only loaded when `VITE_CLOUD=mock` (see `npm run dev:mock`) in the
 * dev server and is not included in production builds.
 */
import { hashString, uid } from '../domain/ids';
import { linkErrorMessage, readEmailLink, withoutEmailLink } from './emailLink';
import type { AuthEvent, AuthResult, CloudApi, CloudUser, DocumentGateway, EmailLinkOutcome } from './types';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface MockUser {
  id: string;
  email: string;
  passHash: string;
  confirmed: boolean;
}

interface MockDb {
  users: Record<string, MockUser>; // keyed by email
  docs: Record<string, { data: unknown; version: number }>; // keyed by user id
  session: string | null; // user id
}

const KEY = 'pace:mock-cloud:v1';
const MIN_SERVER_PASSWORD = 6;

export interface MockCloudOptions {
  /** Behave like a project with "Confirm email" turned on. */
  requireEmailConfirmation?: boolean;
}

export type MockCloud = CloudApi & {
  /** Test/dev helpers that stand in for things a real server does (emails, other devices). */
  debug: {
    confirmEmail(email: string): void;
    openRecoveryLink(email: string): void;
    readDb(): MockDb;
    writeDb(db: MockDb): void;
  };
};

export function createMockCloud(storage: KeyValueStorage = window.localStorage, options: MockCloudOptions = {}): MockCloud {
  const listeners = new Set<(event: AuthEvent, user: CloudUser | null) => void>();

  const read = (): MockDb => {
    try {
      const raw = storage.getItem(KEY);
      if (raw) return JSON.parse(raw) as MockDb;
    } catch {
      /* fall through to an empty database */
    }
    return { users: {}, docs: {}, session: null };
  };
  const write = (db: MockDb) => storage.setItem(KEY, JSON.stringify(db));
  const emit = (event: AuthEvent, user: CloudUser | null) => listeners.forEach((l) => l(event, user));
  const publicUser = (u: MockUser | undefined): CloudUser | null => (u ? { id: u.id, email: u.email } : null);
  const currentUser = (db: MockDb): MockUser | undefined => Object.values(db.users).find((u) => u.id === db.session);
  const hash = (password: string, id: string) => hashString(`${id}:${password}`);

  const api: MockCloud = {
    kind: 'mock',

    async getUser() {
      return publicUser(currentUser(read()));
    },

    async completeEmailLink(): Promise<EmailLinkOutcome> {
      // The fake sends no emails, but an error link (?error_code=otp_expired) shows how failures look.
      if (typeof window === 'undefined') return { kind: 'none' };
      const link = readEmailLink(window.location.href);
      if (!link) return { kind: 'none' };
      window.history.replaceState(window.history.state, '', withoutEmailLink(window.location.href));
      return link.errorCode ? { kind: 'error', message: linkErrorMessage(link.errorCode) } : { kind: 'none' };
    },

    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async signUp(email, password): Promise<AuthResult> {
      const db = read();
      if (password.length < MIN_SERVER_PASSWORD) return { ok: false, error: 'That password is too easy to guess. Try a longer one.' };
      // Same answer for an existing email, like the real service (no account enumeration).
      if (db.users[email]) return { ok: true, needsEmailConfirmation: true };
      const id = uid('user');
      const confirmed = !options.requireEmailConfirmation;
      db.users[email] = { id, email, passHash: hash(password, id), confirmed };
      if (confirmed) db.session = id;
      write(db);
      if (confirmed) emit('signed-in', { id, email });
      return { ok: true, needsEmailConfirmation: !confirmed };
    },

    async signIn(email, password): Promise<AuthResult> {
      const db = read();
      const user = db.users[email];
      if (!user || user.passHash !== hash(password, user.id)) return { ok: false, error: 'That email and password don’t match.' };
      if (!user.confirmed) return { ok: false, error: 'Please confirm your email first. We sent you a link when you signed up.' };
      db.session = user.id;
      write(db);
      emit('signed-in', { id: user.id, email });
      return { ok: true };
    },

    async signOut() {
      const db = read();
      db.session = null;
      write(db);
      emit('signed-out', null);
    },

    async requestPasswordReset(): Promise<AuthResult> {
      return { ok: true };
    },

    async updatePassword(newPassword): Promise<AuthResult> {
      const db = read();
      const user = currentUser(db);
      if (!user) return { ok: false, error: 'Your session ended. Please sign in again.' };
      if (newPassword.length < MIN_SERVER_PASSWORD) return { ok: false, error: 'That password is too easy to guess. Try a longer one.' };
      if (user.passHash === hash(newPassword, user.id)) return { ok: false, error: 'Please choose a password you haven’t used before.' };
      user.passHash = hash(newPassword, user.id);
      write(db);
      return { ok: true };
    },

    async deleteAccount(): Promise<AuthResult> {
      const db = read();
      const user = currentUser(db);
      if (!user) return { ok: false, error: 'Your session ended. Please sign in again.' };
      delete db.users[user.email];
      delete db.docs[user.id];
      db.session = null;
      write(db);
      emit('signed-out', null);
      return { ok: true };
    },

    gatewayFor(user: CloudUser): DocumentGateway {
      return {
        async fetch() {
          const doc = read().docs[user.id];
          return doc ? { data: JSON.parse(JSON.stringify(doc.data)) as unknown, version: doc.version } : null;
        },
        async write(data, expected) {
          const db = read();
          // A signed-out or different session can never write someone else's row.
          if (db.session !== user.id) throw new Error('Not signed in');
          const current = db.docs[user.id];
          const currentVersion = current?.version ?? 0;
          if (currentVersion !== expected) return { ok: false, remoteVersion: currentVersion };
          db.docs[user.id] = { data: JSON.parse(JSON.stringify(data)) as unknown, version: expected + 1 };
          write(db);
          return { ok: true, version: expected + 1 };
        },
        async remove() {
          const db = read();
          if (db.session !== user.id) throw new Error('Not signed in');
          delete db.docs[user.id];
          write(db);
        },
      };
    },

    debug: {
      confirmEmail(email) {
        const db = read();
        if (db.users[email]) db.users[email].confirmed = true;
        write(db);
      },
      openRecoveryLink(email) {
        const db = read();
        const user = db.users[email];
        if (!user) return;
        db.session = user.id;
        write(db);
        emit('password-recovery', { id: user.id, email });
      },
      readDb: read,
      writeDb: write,
    },
  };
  return api;
}
