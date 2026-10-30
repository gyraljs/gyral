// gyralDevMiddleware after an edit to a component (gyral-ejc): Vite runs the edited module again,
// its define() records the new spec, and the next request renders it. Before, the first
// definition of a tag won until the server restarted.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { gyral } from '@gyral/core/vite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { gyralDevMiddleware, type DevMiddleware } from '../src/node.js';

const labels = (text: string): string => `export const greeting = ${JSON.stringify(text)};\n`;

const component = (color: string): string => `
  import { css, define, html } from '@gyral/core';
  import { greeting } from './labels.js';

  export const Greeting = define<{ readonly n: number }>()('dev-greeting', {
    init: () => ({ n: 0 }),
    view: () => html\`<p class="${color}">\${greeting}</p>\`,
    styles: css\`p { color: ${color}; }\`,
  });
`;

const app = `
  import { html } from '@gyral/core';
  import { registryVersion, renderToString } from '@gyral/core/internal/server';
  import '../src/greeting.js';

  export function createApp() {
    return {
      fetch: () =>
        new Response(
          renderToString(html\`<dev-greeting></dev-greeting>\`, { dev: false }) +
            '<!-- registry ' + String(registryVersion()) + ' -->',
        ),
    };
  }
`;

let root = '';
let dev: DevMiddleware;
let host: Server;
let url = '';

function write(path: string, source: string): void {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, source);
}

/** Edits a module the way an editor does: the file, then the watcher's change event. */
function edit(path: string, source: string): void {
  write(path, source);
  dev.vite.watcher.emit('change', join(root, path));
}

beforeAll(async () => {
  // Inside this package, so '@gyral/core' resolves through its node_modules.
  root = mkdtempSync(join(import.meta.dirname, '.tmp-dev-redefine-'));
  write('src/labels.ts', labels('Hello v1'));
  write('src/greeting.ts', component('red'));
  write('server/app.ts', app);
  dev = await gyralDevMiddleware({
    entry: '/server/app.ts',
    vite: {
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: gyral({ types: false }),
      server: { hmr: false },
    },
    app: (mod: { createApp: () => { fetch: () => Response } }) => mod.createApp(),
  });
  host = createServer(dev.middleware);
  await new Promise<void>((resolve) => host.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${String((host.address() as AddressInfo).port)}/`;
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

const page = async (): Promise<string> => (await fetch(url)).text();
const registry = (html: string): number => Number(/<!-- registry (\d+) -->/.exec(html)?.[1]);

it('renders an edited component, and a component whose imports were edited, on the next request', async () => {
  // The first request loads the server module through Vite: slow on a busy machine.
  const first = await page();
  expect(first).toContain('<p class="red">Hello v1</p>');
  expect(first).toContain('color: red');

  // A module the component's view reads (starwars.run's labels.ts).
  edit('src/labels.ts', labels('Hello v2'));
  await expect.poll(page, { timeout: 15_000 }).toContain('<p class="red">Hello v2</p>');

  // The component itself: its view and its styles, so the registry (and CSP caches) change.
  edit('src/greeting.ts', component('blue'));
  await expect.poll(page, { timeout: 15_000 }).toContain('<p class="blue">Hello v2</p>');
  const edited = await page();
  expect(edited).toContain('color: blue');
  expect(edited).not.toContain('color: red');
  expect(registry(edited)).toBeGreaterThan(registry(first));

  // Requests between edits keep the registry as it is.
  expect(registry(await page())).toBe(registry(edited));
}, 60_000);
