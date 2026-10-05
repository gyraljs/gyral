/// <reference types="node" />
// `npm run build`, after `vite build`: renders every static path to dist/static.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientEntryFromManifest, prerender } from '@gyral/ssr/static';
import { createApp, staticPaths } from './app.js';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const clientEntry = await clientEntryFromManifest(
  join(dist, 'client', '.vite', 'manifest.json'),
  'src/entry-client.ts',
);
const pages = await prerender({
  app: createApp({ clientEntry }),
  paths: staticPaths,
  outDir: join(dist, 'static'),
});
console.log(`prerendered ${pages.map((p) => p.path).join(', ')}`);
