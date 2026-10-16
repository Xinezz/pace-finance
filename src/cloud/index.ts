import type { CloudApi } from './types';

let cached: Promise<CloudApi | null> | null = null;

/** True when the build is set up to talk to an accounts backend (real or, in development, the fake). */
export function isCloudConfigured(): boolean {
  if (import.meta.env.DEV && import.meta.env.VITE_CLOUD === 'mock') return true;
  return Boolean(import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim());
}

/**
 * Resolves the accounts backend, or null when none is configured (Pace then runs local-only).
 * The heavy Supabase client is loaded lazily so local-only visitors never download it.
 */
export function loadCloud(): Promise<CloudApi | null> {
  if (!cached) {
    cached = (async () => {
      // The fake is development-only. `import.meta.env.DEV` is false in production builds, so this
      // whole branch (and mockCloud.ts) is removed from them.
      if (import.meta.env.DEV && import.meta.env.VITE_CLOUD === 'mock') {
        const { createMockCloud } = await import('./mockCloud');
        const mock = createMockCloud();
        (window as unknown as { __paceMockCloud?: unknown }).__paceMockCloud = mock;
        return mock;
      }
      const url = import.meta.env.VITE_SUPABASE_URL?.trim();
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
      if (!url || !key) return null;
      if (!/^https?:\/\//.test(url)) {
        console.warn('VITE_SUPABASE_URL should start with https://. Running without accounts.');
        return null;
      }
      const { createSupabaseCloud } = await import('./supabaseCloud');
      return createSupabaseCloud(url, key);
    })();
  }
  return cached;
}
