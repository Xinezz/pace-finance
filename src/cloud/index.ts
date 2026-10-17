import { keyProblem } from './keys';
import type { CloudApi } from './types';

let cached: Promise<CloudApi | null> | null = null;

const isMock = () => import.meta.env.DEV && import.meta.env.VITE_CLOUD === 'mock';

/** The configured Supabase URL and browser key. The publishable key is preferred; the legacy anon key still works. */
function supabaseEnv(): { url: string; key: string } {
  return {
    url: import.meta.env.VITE_SUPABASE_URL?.trim() ?? '',
    key: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim(),
  };
}

/** A setup mistake worth showing to whoever configured the site (for example a secret key), or null. */
export function cloudConfigProblem(): string | null {
  if (isMock()) return null;
  const { url, key } = supabaseEnv();
  return keyProblem(url, key);
}

/** True when the build is set up to talk to an accounts backend (real or, in development, the fake). */
export function isCloudConfigured(): boolean {
  if (isMock()) return true;
  const { url, key } = supabaseEnv();
  return Boolean(url && key) && cloudConfigProblem() === null;
}

/**
 * Resolves the accounts backend, or null when none is configured (Pace then runs local-only).
 * The heavy Supabase client is loaded lazily so local-only visitors never download it.
 */
export function loadCloud(): Promise<CloudApi | null> {
  if (!cached) {
    cached = (async () => {
      // The fake is development-only. `import.meta.env.DEV` is false in production builds, so this
      // whole branch (and mockCloud.ts) is removed from them. (Written out rather than calling isMock()
      // so the bundler can see the condition is constant and drop the chunk.)
      if (import.meta.env.DEV && import.meta.env.VITE_CLOUD === 'mock') {
        const { createMockCloud } = await import('./mockCloud');
        const mock = createMockCloud();
        (window as unknown as { __paceMockCloud?: unknown }).__paceMockCloud = mock;
        return mock;
      }
      const problem = cloudConfigProblem();
      if (problem) {
        // Refuse to run with an unsafe or half-finished configuration rather than guess.
        console.error(`Pace accounts are switched off: ${problem}`);
        return null;
      }
      const { url, key } = supabaseEnv();
      if (!url || !key) return null;
      const { createSupabaseCloud } = await import('./supabaseCloud');
      return createSupabaseCloud(url, key);
    })();
  }
  return cached;
}
