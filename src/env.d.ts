/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Set to "mock" (see .env.mock) to use the in-browser fake accounts backend in development. */
  readonly VITE_CLOUD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
