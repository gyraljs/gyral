import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

// Production client build (gyral-4k7.3): only the client entry is bundled; the server renders
// HTML. The manifest maps the entry to its content-hashed file for the server and prerender.
// gyralVitePreset(): one Lit copy and Lit's modules pre-bundled (gyral-a7r).
export default defineConfig({
  ...gyralVitePreset(),
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: { input: 'src/entry-client.ts' },
  },
});
