/// <reference types="node" />
// `pnpm start` after `pnpm build`: serves the production build (gyral-4k7.3). Every route is
// rendered per request (no `ssg` routes): forms POST to the same app.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { toNodeListener } from '@gyral/ssr/node';
import { productionServer } from '@gyral/ssr/static';
import { createApp } from './app.js';

const port = Number(process.env['PORT'] ?? 5173);
const app = await productionServer({
  distDir: fileURLToPath(new URL('../dist', import.meta.url)),
  createApp,
  staticDir: false,
});

createServer(toNodeListener(app.fetch)).listen(port, () => {
  console.log(`register example (production): http://localhost:${String(port)}`);
});
