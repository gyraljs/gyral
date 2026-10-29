import { defineConfig } from 'vite';
import { gyral } from '@gyral/core/vite';

// Production client build (gyral-4k7.3): the server renders HTML. `components: true` gives the
// components under src/ their own modules behind a loader, and writes the manifests the server
// reads, so each page loads exactly the components it rendered (no client entry to keep).
export default defineConfig({
  plugins: [gyral({ components: true })],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
});
