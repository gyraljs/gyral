/// <reference types="node" />
// `pnpm start` after `pnpm build`: serves the production build (gyral-4k7.3).
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { toNodeListener } from '@gyral/ssr/node';
import { createProdApp } from './prod-app.js';

const port = Number(process.env['PORT'] ?? 5173);
const app = await createProdApp({ distDir: fileURLToPath(new URL('../dist', import.meta.url)) });

createServer(toNodeListener(app.fetch)).listen(port, () => {
  console.log(`isomorphic example (production): http://localhost:${String(port)}`);
});
