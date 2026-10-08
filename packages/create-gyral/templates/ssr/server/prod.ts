/// <reference types="node" />
// `npm run preview` after `npm run build`: serves the production build. Hashed assets are
// cached immutable, prerendered pages come from dist/static, and anything else is rendered
// per request by the same app.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { toNodeListener } from '@gyral/ssr/node';
import { productionServer } from '@gyral/ssr/static';
import { createApp } from './app.js';

const port = Number(process.env['PORT'] ?? 4173);
const app = await productionServer({
  distDir: fileURLToPath(new URL('../dist', import.meta.url)),
  createApp,
});

// Behind a proxy, pass { origin: 'https://example.com' } so absolute URLs use the public origin.
createServer(toNodeListener(app.fetch)).listen(port, () => {
  console.log(`Production build: http://localhost:${String(port)}`);
});
