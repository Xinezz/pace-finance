/**
 * The accounts backend, as the app sees it. Supabase implements it for real; a small in-browser
 * fake implements it for development and tests. Swapping providers later means writing one more
 * implementation of `CloudApi`; no screen or store changes.
 */
import type { EmailLinkOutcome } from './emailLink';

export interface CloudUser {
  id: string;
  email: string;
}

export type AuthEvent = 'signed-in' | 'signed-out' | 'password-recovery';

export type { EmailLinkOutcome };

export interface AuthResult {
  ok: boolean;
  /** A message that is safe to show the person. Never contains provider internals. */
  error?: string;
  /** Sign-up worked but they must click the link we emailed before signing in. */
  needsEmailConfirmation?: boolean;
}

export type WriteResult = { ok: true; version: number } | { ok: false; remoteVersion: number };

/** Where one signed-in user's document lives. Every call is scoped to that user. */
export interface DocumentGateway {
  /** null when the account has no saved data yet. */
  fetch(): Promise<{ data: unknown; version: number } | null>;
  /**
   * Save only if the stored version still equals `expectedVersion` (0 means "no row yet").
   * Returns the new version, or the remote version when someone else saved first.
   */
  write(data: unknown, expectedVersion: number): Promise<WriteResult>;
  remove(): Promise<void>;
}

export interface CloudApi {
  readonly kind: 'supabase' | 'mock';
  getUser(): Promise<CloudUser | null>;
  /**
   * Finishes the sign-up confirmation or password-reset link this page was opened from, if any, and tidies
   * the address bar. Safe to call more than once: the link is only used the first time.
   */
  completeEmailLink(): Promise<EmailLinkOutcome>;
  /** Returns an unsubscribe function. */
  onAuthChange(cb: (event: AuthEvent, user: CloudUser | null) => void): () => void;
  signUp(email: string, password: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<AuthResult>;
  updatePassword(newPassword: string): Promise<AuthResult>;
  /** Permanently erases the signed-in user's login and all of their data. */
  deleteAccount(): Promise<AuthResult>;
  gatewayFor(user: CloudUser): DocumentGateway;
}
