// gyralDevMiddleware (gyral-337.12): the dev server as middleware inside a server of the app's
// own, building the app once per server-module version instead of once per request.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { gyral } from '@gyral/core/vite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { gyralDevMiddleware, type DevMiddleware } from '../src/node.js';

const appSource = (version: string): string => `
  export function createApp() {
    return { fetch: () => new Response(${JSON.stringify(version)}) };
  }
`;

let root = '';
let dev: DevMiddleware;
let host: Server;
let url = '';
let builds = 0;

beforeAll(async () => {
  // Inside this package, so '@gyral/core' resolves through its node_modules.
  root = mkdtempSync(join(import.meta.dirname, '.tmp-dev-middleware-'));
  const file = join(root, 'server/app.ts');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, appSource('v1'));
  dev = await gyralDevMiddleware({
    entry: '/server/app.ts',
    vite: {
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: gyral({ types: false }),
      server: { hmr: false },
    },
    app: (mod: { createApp: () => { fetch: () => Response } }) => {
      builds += 1;
      return mod.createApp();
    },
  });
  // The server's own route comes first; everything else reaches the middleware.
  host = createServer((req, res) => {
    if (req.url === '/health') res.end('ok');
    else dev.middleware(req, res);
  });
  await new Promise<void>((resolve) => host.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${String((host.address() as AddressInfo).port)}`;
}, 60_000);

afterAll(async () => {
  await new Promise<void>((resolve) => {
    host.close(() => {
      resolve();
    });
    host.closeAllConnections();
  });
  await dev.close();
  rmSync(root, { recursive: true, force: true });
});

const text = async (path: string): Promise<string> => (await fetch(url + path)).text();

it("serves the host server's own routes next to the app", async () => {
  expect(await text('/health')).toBe('ok');
  // The first request loads the server module through Vite: slow on a busy machine.
  expect(await text('/')).toBe('v1');
}, 60_000);

it('builds the app once per module version, not per request', async () => {
  const before = builds;
  expect(await text('/a')).toBe('v1');
  expect(await text('/b')).toBe('v1');
  expect(builds).toBe(before);

  const file = join(root, 'server/app.ts');
  writeFileSync(file, appSource('v2'));
  dev.vite.watcher.emit('change', file); // what the file watcher reports after an edit
  await expect.poll(() => text('/c'), { timeout: 10_000 }).toBe('v2');
  expect(builds).toBe(before + 1);
});
