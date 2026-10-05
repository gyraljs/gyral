/// <reference types="node" />
// `pnpm start` after `pnpm build`: serves the production build (gyral-4k7.3).
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createProdApp } from './prod-app.js';

const port = Number(process.env['PORT'] ?? 5173);
const app = await createProdApp({ distDir: fileURLToPath(new URL('../dist', import.meta.url)) });

serve({ fetch: app.fetch, port }, () => {
  console.log(`isomorphic example (production): http://localhost:${String(port)}`);
});
