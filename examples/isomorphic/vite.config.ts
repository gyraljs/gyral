import { defineConfig } from 'vite';
import { gyral } from '@gyral/core/vite';

// Production client build (gyral-4k7.3): only the client entry is bundled; the server renders
// HTML. The manifest maps the entry to its content-hashed file for the server and prerender.
// gyral(): the template compiler (docs/references/consumer-setup.md).
export default defineConfig({
  plugins: [gyral()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: { input: 'src/entry-client.ts' },
  },
});
