// Automatic component loading end to end: `gyralVitePreset({ components: true })` finds the
// app's components, splits each into its own module behind a loader and writes the manifest
// `componentsFromManifest` reads; `gyralDevServer` serves the same loader from source.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';
import { gyralDevServer, type DevServer } from '../src/node.js';
import { componentsFromManifest } from '../src/static.js';

const SSR = resolve(import.meta.dirname, '../src/index.ts');

const files: Record<string, string> = {
  'src/card.ts': `
    import { define, html } from '@gyral/core';
    export const Card = define()('vt-card', { init: () => ({}), view: () => html\`<p>card</p>\` });
  `,
  'src/list.ts': `
    import { define, html } from '@gyral/core';
    import './card.js';
    export const List = define<{ readonly n: number }>()('vt-list', {
      init: () => ({ n: 1 }),
      view: (s) => html\`<p>\${s.n}</p><vt-card></vt-card>\`,
    });
  `,
  'src/list.test.ts': `
    import { define, html } from '@gyral/core';
    define()('vt-test-only', { init: () => ({}), view: () => html\`\` });
  `,
  'src/plain.ts': `
    customElements.define('vt-plain', class extends HTMLElement {});
  `,
  'server/app.ts': `
    import { html } from '@gyral/core';
    import { renderPage } from ${JSON.stringify(SSR)};
    import '../src/list.js';
    let requests = 0;
    export function createApp(components, state) {
      return {
        fetch(request) {
          const { pathname } = new URL(request.url);
          state.count += 1;
          if (pathname === '/boom') throw new Error('render failed');
          if (pathname === '/plain') return renderPage({ title: 'p', body: html\`<p>plain</p>\`, components });
          return renderPage({ title: 'list', body: html\`<vt-list></vt-list>\`, components });
        },
      };
    }
  `,
};

let root = '';
beforeAll(() => {
  // Inside this package, so '@gyral/core' resolves through its node_modules.
  root = mkdtempSync(join(import.meta.dirname, '.tmp-components-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('gyralVitePreset({ components: true }) in a build', () => {
  it('splits each defined component behind the loader and writes the components manifest', async () => {
    const dist = join(root, 'dist');
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      ...gyralVitePreset({ components: true }),
      build: { outDir: dist, emptyOutDir: true, minify: false },
    });
    const written = JSON.parse(
      readFileSync(join(dist, '.vite', 'gyral-components.json'), 'utf8'),
    ) as { loader: string; modules: Record<string, string> };
    expect(written.modules).toEqual({ 'vt-card': 'src/card.ts', 'vt-list': 'src/list.ts' });
    const loader = readFileSync(join(dist, written.loader), 'utf8');
    expect(loader).toContain('vt-list');
    expect(loader).toContain('MutationObserver');

    const components = await componentsFromManifest(dist);
    const list = components?.modules.get('vt-list');
    const card = components?.modules.get('vt-card');
    expect(list?.preload[0]).toMatch(/^\/assets\/list-[\w-]+\.js$/);
    // list.ts imports card.ts, so a page rendering <vt-list> preloads card's chunk too.
    expect(list?.preload).toContain(card?.preload[0]);
    for (const url of list?.preload ?? []) expect(existsSync(join(dist, url))).toBe(true);
  });
});

describe('gyralDevServer', () => {
  let dev: DevServer;
  const state = { count: 0 };
  beforeAll(async () => {
    dev = await gyralDevServer({
      entry: '/server/app.ts',
      port: 0,
      host: '127.0.0.1',
      vite: {
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: gyralVitePreset({ components: true }).plugins,
        server: { hmr: false },
      },
      state: () => state,
      app: (
        mod: {
          createApp: (c: unknown, s: { count: number }) => { fetch: (r: Request) => Response };
        },
        ctx,
      ) => mod.createApp(ctx.components, ctx.state),
    });
  });
  afterAll(async () => {
    await dev.close();
  });

  const get = (path: string) => fetch(new URL(path, dev.url));

  it('server-renders pages with the loader and Vite client after the body', async () => {
    const response = await get('/');
    expect(response.status).toBe(200);
    const page = await response.text();
    expect(page).toContain('<vt-list');
    expect(page).toContain('<script type="module" src="/@vite/client"></script>');
    expect(page).toContain('<script type="module" src="/@id/virtual:gyral/components"></script>');
  });

  it('loads nothing on a page without components', async () => {
    expect(await (await get('/plain')).text()).not.toContain('<script');
  });

  it('serves the loader from source, with every defined tag and no test-only ones', async () => {
    const response = await get('/@id/virtual:gyral/components');
    expect(response.status).toBe(200);
    const code = await response.text();
    expect(code).toContain('/src/list.ts');
    expect(code).toContain('/src/card.ts');
    expect(code).not.toContain('vt-test-only');
    expect(code).not.toContain('vt-plain');
  });

  it('answers a render error with 500 and the error overlay, and keeps state across requests', async () => {
    const before = state.count;
    const response = await get('/boom');
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('ErrorOverlay');
    expect(state.count).toBe(before + 1);
  });
});
