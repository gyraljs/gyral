/// <reference types="node" />
// `pnpm start` after `pnpm build`: serves the production build (gyral-4k7.3). Every route is
// rendered per request (no `ssg` routes): forms POST to the same app.
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { productionServer } from '@gyral/ssr/static';
import { createApp } from './app.js';

const port = Number(process.env['PORT'] ?? 5173);
const app = await productionServer({
  distDir: fileURLToPath(new URL('../dist', import.meta.url)),
  createApp,
});

serve({ fetch: app.fetch, port }, () => {
  console.log(`register example (production): http://localhost:${String(port)}`);
});
