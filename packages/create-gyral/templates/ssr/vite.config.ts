import { defineConfig } from 'vite';
import { gyral } from '@gyral/core/vite';

// Client build only: the server renders the HTML. `components: true` gives every component
// under src/ its own client module and adds the loader to the build; the manifests it writes
// let server/prerender.ts and server/prod.ts link exactly what each page rendered.
export default defineConfig({
  plugins: [gyral({ components: true })],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
});
