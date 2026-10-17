import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { linkErrorMessage, OPENED_IN_ANOTHER_BROWSER, readEmailLink, withoutEmailLink, type EmailLinkOutcome } from './emailLink';
import type { AuthEvent, AuthResult, CloudApi, CloudUser, DocumentGateway, WriteResult } from './types';

const TABLE = 'user_data';

interface ProviderError {
  message: string;
  code?: string;
  status?: number;
}

/** Turn provider errors into messages that are kind, accurate, and reveal nothing about other accounts. */
function friendly(err: ProviderError, fallback: string): string {
  switch (err.code) {
    case 'invalid_credentials':
      return 'That email and password don’t match.';
    case 'email_not_confirmed':
      return 'Please confirm your email first. We sent you a link when you signed up.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'weak_password':
      return 'That password is too easy to guess. Try a longer one.';
    case 'same_password':
      return 'Please choose a password you haven’t used before.';
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'New accounts can’t be created on this site right now.';
    case 'user_banned':
      return 'This account has been disabled.';
    case 'email_address_not_authorized':
      // Supabase's built-in email only reaches the project's own team until custom SMTP is set up.
      return 'This site can’t send email to that address yet. Use the email address of the Supabase account that owns this project (see supabase/SETUP.md).';
    case 'session_expired':
    case 'session_not_found':
    case 'refresh_token_not_found':
      return 'Your session ended. Please sign in again.';
  }
  if (err.status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (err.status === 0 || /fetch|network/i.test(err.message)) return 'We couldn’t reach the server. Check your connection and try again.';
  return fallback;
}

const toUser = (u: User | null | undefined): CloudUser | null => (u && u.email ? { id: u.id, email: u.email } : null);

/** Where the email links should send people back to: this exact site, without query or hash. */
const returnUrl = () => `${window.location.origin}${window.location.pathname}`;

const nextTick = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

export function createSupabaseCloud(url: string, anonKey: string): CloudApi {
  // Read what an email link brought before supabase-js tidies the address bar during start-up.
  const arrivedWith = readEmailLink(window.location.href);

  const client: SupabaseClient = createClient(url, anonKey, {
    auth: {
      // PKCE keeps tokens out of the URL, which matters because this app uses #/hash routing.
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  // Listen from the very start: a password-reset link is announced while the client is still starting up.
  let recoveryLink = false;
  client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') recoveryLink = true;
  });

  let linkOutcome: Promise<EmailLinkOutcome> | null = null;
  async function finishEmailLink(): Promise<EmailLinkOutcome> {
    if (!arrivedWith) return { kind: 'none' };
    // Waits for start-up, including exchanging a one-time ?code= from the link if this browser can.
    const { data } = await client.auth.getSession();
    let outcome: EmailLinkOutcome;
    if (arrivedWith.tokenHash && arrivedWith.type) {
      // token_hash links don't depend on this browser, so they work from any phone or email app.
      const { error } = await client.auth.verifyOtp({ token_hash: arrivedWith.tokenHash, type: arrivedWith.type });
      if (error) outcome = { kind: 'error', message: linkErrorMessage(error.code) };
      else outcome = arrivedWith.type === 'recovery' ? { kind: 'recovery' } : { kind: 'signed-in' };
    } else if (arrivedWith.errorCode) {
      outcome = { kind: 'error', message: linkErrorMessage(arrivedWith.errorCode) };
    } else if (data.session) {
      // The reset announcement is queued just after start-up; give it a moment to arrive.
      await nextTick();
      await nextTick();
      outcome = recoveryLink ? { kind: 'recovery' } : { kind: 'signed-in' };
    } else {
      outcome = { kind: 'error', message: OPENED_IN_ANOTHER_BROWSER };
    }
    window.history.replaceState(window.history.state, '', withoutEmailLink(window.location.href));
    return outcome;
  }

  function gatewayFor(user: CloudUser): DocumentGateway {
    const fetchDoc = async () => {
      const { data, error } = await client.from(TABLE).select('data, version').eq('user_id', user.id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { data: data.data as unknown, version: data.version as number } : null;
    };

    return {
      fetch: fetchDoc,

      async write(doc: unknown, expected: number): Promise<WriteResult> {
        if (expected === 0) {
          const { error } = await client.from(TABLE).insert({ user_id: user.id, data: doc, version: 1 });
          if (!error) return { ok: true, version: 1 };
          // 23505 = a row already exists: another device created the account's data first.
          if (error.code === '23505') return { ok: false, remoteVersion: (await fetchDoc())?.version ?? 1 };
          throw new Error(error.message);
        }
        const { data, error } = await client
          .from(TABLE)
          .update({ data: doc, version: expected + 1 })
          .eq('user_id', user.id)
          .eq('version', expected)
          .select('version');
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) return { ok: false, remoteVersion: (await fetchDoc())?.version ?? expected + 1 };
        return { ok: true, version: expected + 1 };
      },

      async remove() {
        const { error } = await client.from(TABLE).delete().eq('user_id', user.id);
        if (error) throw new Error(error.message);
      },
    };
  }

  return {
    kind: 'supabase',

    async getUser() {
      const { data } = await client.auth.getSession();
      return toUser(data.session?.user);
    },

    completeEmailLink() {
      linkOutcome ??= finishEmailLink();
      return linkOutcome;
    },

    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        // Keep this callback synchronous: calling back into the client here can deadlock it.
        const user = toUser(session?.user);
        let mapped: AuthEvent | null = null;
        if (event === 'PASSWORD_RECOVERY') mapped = 'password-recovery';
        else if (event === 'SIGNED_OUT') mapped = 'signed-out';
        else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') mapped = user ? 'signed-in' : null;
        if (mapped) cb(mapped, user);
      });
      return () => data.subscription.unsubscribe();
    },

    async signUp(email, password): Promise<AuthResult> {
      const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: returnUrl() } });
      if (error) return { ok: false, error: friendly(error, 'We couldn’t create that account. Please try again.') };
      // If the email is already registered, Supabase returns a user with no identities. We answer exactly as
      // for a new sign-up, so this form can't be used to find out who has an account.
      const alreadyRegistered = !!data.user && (data.user.identities?.length ?? 1) === 0;
      return { ok: true, needsEmailConfirmation: alreadyRegistered || !data.session };
    },

    async signIn(email, password): Promise<AuthResult> {
      const { error } = await client.auth.signInWithPassword({ email, password });
      return error ? { ok: false, error: friendly(error, 'We couldn’t sign you in. Please try again.') } : { ok: true };
    },

    async signOut() {
      await client.auth.signOut();
    },

    async requestPasswordReset(email): Promise<AuthResult> {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: returnUrl() });
      // Only report rate limiting. Anything else looks like success so the form never confirms whether an email exists.
      if (error && (error.status === 429 || /rate_limit/.test(error.code ?? ''))) return { ok: false, error: friendly(error, '') };
      return { ok: true };
    },

    async updatePassword(newPassword): Promise<AuthResult> {
      const { error } = await client.auth.updateUser({ password: newPassword });
      return error ? { ok: false, error: friendly(error, 'We couldn’t change the password. Please try again.') } : { ok: true };
    },

    async deleteAccount(): Promise<AuthResult> {
      const { error } = await client.rpc('delete_my_account');
      if (error) return { ok: false, error: 'We couldn’t delete the account. Please try again.' };
      // The login no longer exists, so just clear the local session.
      await client.auth.signOut({ scope: 'local' });
      return { ok: true };
    },

    gatewayFor,
  };
}
