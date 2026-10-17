import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadCloud } from '../cloud';
import type { AuthResult, CloudApi, CloudUser } from '../cloud/types';
import { normalizeEmail } from './validate';

export type AuthStatus =
  /** Working out whether anyone is signed in. */
  | 'loading'
  /** No accounts backend is configured: the app runs on this device only, as before. */
  | 'unconfigured'
  | 'signed-out'
  | 'signed-in'
  /** Arrived from a password-reset email and must choose a new password. */
  | 'recovery'
  /** Chose "continue without an account": data stays on this device. */
  | 'guest';

interface AuthApi {
  status: AuthStatus;
  user: CloudUser | null;
  /** Something to tell the person on the sign-in screen, e.g. why an email link didn't work. */
  notice: string | null;
  dismissNotice: () => void;
  cloud: CloudApi | null;
  /**
   * Identifies whose data is on screen. When it changes (sign in, sign out, switching accounts) the whole
   * data layer is rebuilt from scratch, so one person's data can never linger on screen for the next.
   */
  scope: string;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  deleteAccount: () => Promise<AuthResult>;
  continueAsGuest: () => void;
  leaveGuestMode: () => void;
}

const AuthContext = createContext<AuthApi | null>(null);
const GUEST_KEY = 'pace:guest';

function readGuest(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
}

function writeGuest(on: boolean) {
  try {
    if (on) localStorage.setItem(GUEST_KEY, '1');
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    /* blocked storage: guest mode just won't persist across reloads */
  }
}

/**
 * Leaving an account does a full page load rather than just clearing state. That wipes the previous
 * person's data from memory and the DOM (charts keep measuring helpers around, for example), which
 * matters on a shared computer. The URL is reset too, so no page or filter from the old session lingers.
 */
function resetPage() {
  window.location.replace(window.location.pathname);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined = still resolving, null = no backend configured
  const [cloud, setCloud] = useState<CloudApi | null | undefined>(undefined);
  const [user, setUser] = useState<CloudUser | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [guest, setGuest] = useState(readGuest);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    loadCloud()
      .then(async (c) => {
        if (!alive) return;
        if (!c) {
          setCloud(null);
          return;
        }
        // Subscribe first so an auth event fired while we look up the session isn't missed.
        unsubscribe = c.onAuthChange((event, next) => {
          if (event === 'password-recovery') {
            setUser(next);
            setRecovery(true);
          } else if (event === 'signed-out') {
            setUser(null);
            setRecovery(false);
          } else {
            // The same person can be re-announced (token refresh, tab focus). Keep the same object so nothing re-renders.
            setUser((prev) => (prev && next && prev.id === next.id && prev.email === next.email ? prev : next));
          }
        });
        // Opened from a confirmation or password-reset email? Finish that first.
        const link = await c.completeEmailLink();
        if (!alive) return;
        if (link.kind === 'recovery') setRecovery(true);
        else if (link.kind === 'error') {
          // Following an email link means they want their account, so show the sign-in screen with the reason
          // even if this browser was in "without an account" mode. (That mode is one tap away again.)
          setNotice(link.message);
          writeGuest(false);
          setGuest(false);
        }
        const existing = await c.getUser();
        if (!alive) return;
        setUser((prev) => prev ?? existing);
        setCloud(c);
      })
      .catch(() => alive && setCloud(null));
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!cloud) return { ok: false, error: 'Accounts aren’t set up.' };
      const res = await cloud.signIn(normalizeEmail(email), password);
      if (res.ok) {
        writeGuest(false);
        setGuest(false);
        setUser(await cloud.getUser());
      }
      return res;
    },
    [cloud],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!cloud) return { ok: false, error: 'Accounts aren’t set up.' };
      const res = await cloud.signUp(normalizeEmail(email), password);
      if (res.ok && !res.needsEmailConfirmation) {
        writeGuest(false);
        setGuest(false);
        setUser(await cloud.getUser());
      }
      return res;
    },
    [cloud],
  );

  const signOut = useCallback(async () => {
    if (!cloud) return;
    await cloud.signOut();
    setUser(null);
    setRecovery(false);
    resetPage();
  }, [cloud]);

  const requestPasswordReset = useCallback(
    async (email: string) => (cloud ? cloud.requestPasswordReset(normalizeEmail(email)) : { ok: false, error: 'Accounts aren’t set up.' }),
    [cloud],
  );

  const updatePassword = useCallback(
    async (password: string) => {
      if (!cloud) return { ok: false, error: 'Accounts aren’t set up.' };
      const res = await cloud.updatePassword(password);
      if (res.ok) setRecovery(false);
      return res;
    },
    [cloud],
  );

  const deleteAccount = useCallback(async () => {
    if (!cloud) return { ok: false, error: 'Accounts aren’t set up.' };
    const res = await cloud.deleteAccount();
    if (res.ok) {
      setUser(null);
      setRecovery(false);
      resetPage();
    }
    return res;
  }, [cloud]);

  const continueAsGuest = useCallback(() => {
    writeGuest(true);
    setGuest(true);
  }, []);

  const leaveGuestMode = useCallback(() => {
    writeGuest(false);
    setGuest(false);
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<AuthApi>(() => {
    let status: AuthStatus;
    if (cloud === undefined) status = 'loading';
    else if (cloud === null) status = 'unconfigured';
    else if (user && recovery) status = 'recovery';
    else if (user) status = 'signed-in';
    else if (guest) status = 'guest';
    else status = 'signed-out';
    return {
      status,
      user,
      notice,
      dismissNotice,
      cloud: cloud ?? null,
      scope: status === 'signed-in' || status === 'recovery' ? `user:${user?.id}` : 'local',
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      deleteAccount,
      continueAsGuest,
      leaveGuestMode,
    };
  }, [cloud, user, recovery, guest, notice, dismissNotice, signIn, signUp, signOut, requestPasswordReset, updatePassword, deleteAccount, continueAsGuest, leaveGuestMode]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
