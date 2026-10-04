/// <reference types="node" />
// Dev server: Vite serves client modules; every other request is server-rendered.
import http from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { createServer as createViteServer } from 'vite';

const port = Number(process.env['PORT'] ?? 5173);
const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'custom' });

const ssr = getRequestListener(async (request) => {
  // Re-loaded per request, so server-rendered output follows source edits.
  const mod = (await vite.ssrLoadModule('/server/app.ts')) as typeof import('./app.js');
  return mod.createApp({ clientEntry: '/src/entry-client.ts' }).fetch(request);
});

http
  .createServer((req, res) => {
    vite.middlewares(req, res, () => void ssr(req, res));
  })
  .listen(port, () => {
    console.log(`isomorphic example: http://localhost:${String(port)}`);
  });
