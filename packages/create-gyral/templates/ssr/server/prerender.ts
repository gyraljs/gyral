/// <reference types="node" />
// `npm run build`, after `vite build`: renders every static path to dist/static.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentsFromManifest, prerender } from '@gyral/ssr/static';
import { createApp, staticPaths } from './app.js';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const pages = await prerender({
  app: createApp({ components: await componentsFromManifest(join(dist, 'client')) }),
  paths: staticPaths,
  outDir: join(dist, 'static'),
});
console.log(`prerendered ${pages.map((p) => p.path).join(', ')}`);
