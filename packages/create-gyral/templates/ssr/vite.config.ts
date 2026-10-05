import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

// Client build only: the server renders the HTML. The manifest maps the entry to its hashed
// file for server/prerender.ts and server/prod.ts.
export default defineConfig({
  ...gyralVitePreset(),
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: { input: 'src/entry-client.ts' },
  },
});
