/**
 * Recognise which kind of Supabase key was configured.
 *
 * Browsers must only ever get a publishable key (or the legacy "anon" key). A secret key (or the legacy
 * "service_role" key) bypasses Row Level Security and would hand every visitor full access to every
 * account, so the app refuses to start with one.
 */
export type KeyKind = 'publishable' | 'legacy-anon' | 'secret' | 'unknown';

function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3 || !key.startsWith('eyJ')) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function classifyKey(raw: string): KeyKind {
  const key = raw.trim();
  if (key.startsWith('sb_secret_')) return 'secret';
  if (key.startsWith('sb_publishable_')) return 'publishable';
  const role = jwtRole(key);
  if (role === 'service_role' || role === 'supabase_admin') return 'secret';
  if (role === 'anon') return 'legacy-anon';
  return 'unknown';
}

/** A message for the person setting things up, or null when the configuration is safe to use. */
export function keyProblem(url: string | undefined, key: string | undefined): string | null {
  const u = url?.trim() ?? '';
  const k = key?.trim() ?? '';
  if (!u && !k) return null; // not configured at all: local-only mode, not a problem
  if (!u) return 'VITE_SUPABASE_URL is missing.';
  if (!k) return 'VITE_SUPABASE_PUBLISHABLE_KEY is missing.';
  if (!/^https?:\/\//.test(u)) return 'VITE_SUPABASE_URL should start with https://';
  const kind = classifyKey(k);
  if (kind === 'secret') {
    return 'That is a SECRET key. It must never be used in the browser. Use the publishable key (sb_publishable_…) instead, and rotate the secret key in Supabase if it was shared anywhere.';
  }
  return null;
}
