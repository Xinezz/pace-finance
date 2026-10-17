/**
 * Links in sign-up and password-reset emails bring people back to this page with details in the address.
 * This reads those details and turns failures into plain-language messages. Pure, so it can be tested.
 */

export type EmailLinkType = 'email' | 'signup' | 'recovery' | 'invite' | 'magiclink' | 'email_change';

export interface EmailLink {
  /** A token_hash link: works on any device or browser. */
  tokenHash?: string;
  type?: EmailLinkType;
  /** A one-time code: only works in the browser that asked for the email. */
  code?: string;
  /** Set when the link was rejected before reaching us (expired, already used...). */
  errorCode?: string;
}

export type EmailLinkOutcome =
  | { kind: 'none' }
  | { kind: 'signed-in' }
  /** Arrived from a password-reset email: ask for a new password. */
  | { kind: 'recovery' }
  | { kind: 'error'; message: string };

const TYPES: ReadonlySet<string> = new Set<EmailLinkType>(['email', 'signup', 'recovery', 'invite', 'magiclink', 'email_change']);
const LINK_PARAMS = ['token_hash', 'type', 'code', 'error', 'error_code', 'error_description'];

/** What an email link put in the address, or null when the page wasn't opened from one. */
export function readEmailLink(href: string): EmailLink | null {
  const url = new URL(href);
  const q = url.searchParams;
  // Errors can also arrive in the #fragment, which this app otherwise uses for page routes (#/dashboard).
  const frag = new URLSearchParams(url.hash.startsWith('#/') ? '' : url.hash.slice(1));
  const get = (k: string) => q.get(k) ?? frag.get(k) ?? undefined;

  const link: EmailLink = {};
  const tokenHash = q.get('token_hash');
  const type = q.get('type');
  if (tokenHash && type && TYPES.has(type)) {
    link.tokenHash = tokenHash;
    link.type = type as EmailLinkType;
  }
  const code = q.get('code');
  if (code) link.code = code;
  const errorCode = get('error_code') ?? get('error') ?? (get('error_description') ? 'unknown' : undefined);
  if (errorCode) link.errorCode = errorCode;
  return Object.keys(link).length > 0 ? link : null;
}

/** The same address without the link details (they are single-use and shouldn't be bookmarked or shared). */
export function withoutEmailLink(href: string): string {
  const url = new URL(href);
  for (const k of LINK_PARAMS) url.searchParams.delete(k);
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ''}${url.hash.startsWith('#/') ? url.hash : ''}`;
}

export function linkErrorMessage(code: string | undefined): string {
  if (code === 'otp_expired') {
    return 'That link has expired or was already used. Each link works once, for a limited time. Sign in, or ask for a new link below.';
  }
  return 'That link didn’t work. It may have expired or already been used. Sign in, or ask for a new link below.';
}

/** A one-time code link opened in another browser (often an email app's built-in browser) can't be finished here. */
export const OPENED_IN_ANOTHER_BROWSER =
  'That link was opened in a different browser from the one where you asked for it (for example, inside your email app). If you were confirming your email, it’s confirmed now: just sign in. If you were resetting your password, ask for a new link here and open it in this same browser.';
