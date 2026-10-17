/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable key (sb_publishable_…). Safe for browsers; Row Level Security protects the data. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Legacy alternative to the publishable key (Supabase retires these by the end of 2026). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Set to "mock" (see .env.mock) to use the in-browser fake accounts backend in development. */
  readonly VITE_CLOUD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
