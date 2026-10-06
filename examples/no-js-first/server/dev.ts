/// <reference types="node" />
// Dev server: Vite serves client modules; every other request is server-rendered.
import http from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { createServer as createViteServer } from 'vite';
import { devFetch } from '../../shared/dev-fetch.js';

const port = Number(process.env['PORT'] ?? 5173);
// HMR_PORT lets several SSR examples run side by side (Vite's default is 24678). In middleware
// mode the HMR WebSocket needs its own port: Vite 8 sets it with server.ws.port.
const hmrPort = Number(process.env['HMR_PORT'] ?? 24678);
const vite = await createViteServer({
  server: { middlewareMode: true, ws: { port: hmrPort } },
  appType: 'custom',
});

// The app module is re-loaded per request, so server-rendered output follows source edits;
// its in-memory state is created once (examples/shared/dev-fetch.ts).
const ssr = getRequestListener(
  devFetch(
    async () => (await vite.ssrLoadModule('/server/app.ts')) as typeof import('./app.js'),
    (mod) => mod.sampleReplies(),
    (mod, replies) => mod.createApp({ clientEntry: '/src/entry-client.ts', replies }),
  ),
);

http
  .createServer((req, res) => {
    vite.middlewares(req, res, () => void ssr(req, res));
  })
  .listen(port, () => {
    console.log(`no-js-first example: http://localhost:${String(port)}`);
  });
