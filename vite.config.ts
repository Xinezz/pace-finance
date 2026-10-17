/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { classifyKey } from './src/cloud/keys';

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    // Everything VITE_* ends up in the downloadable site, so a secret key must never get this far.
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '';
    if (key && classifyKey(key) === 'secret') {
      throw new Error(
        'Refusing to build: the Supabase key is a SECRET key and would be published with the site. ' +
          'Use the publishable key (sb_publishable_…) and rotate the secret key in Supabase.',
      );
    }
  }

  return {
    // GitHub Pages serves the site from /<repo>/; the deploy workflow sets BASE_PATH. Elsewhere it is the root.
    base: process.env.BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 5173, strictPort: false },
    build: {
      chunkSizeWarningLimit: 1200,
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
