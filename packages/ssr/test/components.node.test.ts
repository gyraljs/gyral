// Automatic component loading (ADR 0016 addendum): a page links the client modules of exactly
// the components it rendered, after the body, and nothing when it rendered none.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { define, html } from '@gyral/core';
import { renderPage, renderToString, type ComponentAssets } from '../src/index.js';
import { page } from '../src/page.js';
import { componentAssets } from '../src/manifest.js';
import { componentsFromManifest, productionServer } from '../src/static.js';

define()('cl-card', { init: () => ({}), intent: {}, update: {}, view: () => html`<p>card</p>` });
define()('cl-list', {
  init: () => ({}),
  intent: {},
  update: {},
  view: () =>
    html`<ul>
      <li><cl-card></cl-card></li>
    </ul>`,
});
define()('cl-orphan', {
  init: () => ({}),
  intent: {},
  update: {},
  view: () => html`<p>orphan</p>`,
});

const assets: ComponentAssets = {
  loader: '/assets/components-L.js',
  preload: ['/assets/preload-helper-P.js'],
  modules: new Map([
    ['cl-list', { preload: ['/assets/list-A.js', '/assets/core-C.js'], stylesheets: [] }],
    [
      'cl-card',
      { preload: ['/assets/card-B.js', '/assets/core-C.js'], stylesheets: ['/assets/card.css'] },
    ],
  ]),
};

const bodyEnd = (out: string): string => out.slice(out.lastIndexOf('</ul>'));

describe('automatic component loading', () => {
  it('links the rendered components after the body: preloads (deduped), CSS and the loader', async () => {
    const out = await renderToString(
      page({ title: 't', body: html`<cl-list></cl-list>`, components: assets, dev: false }),
      { components: assets, dev: false },
    );
    const tail = bodyEnd(out);
    expect(tail).toContain('<link rel="stylesheet" href="/assets/card.css">');
    expect(tail.match(/rel="modulepreload"/g)).toHaveLength(4);
    expect(tail.indexOf('preload-helper-P.js')).toBeLessThan(tail.indexOf('list-A.js'));
    expect(tail.match(/core-C\.js/g)).toHaveLength(1);
    expect(tail).toContain('<script type="module" src="/assets/components-L.js"></script>');
    expect(out).not.toContain('<!--gyral:components-->');
    // Nothing in the head: the tags are known only once the body is written.
    expect(out.slice(0, out.indexOf('<body>'))).not.toContain('components-L.js');
  });

  it('loads nothing on a page that renders no components', async () => {
    const out = await renderToString(
      page({ title: 't', body: html`<p>plain</p>`, components: assets }),
      { components: assets },
    );
    expect(out).not.toContain('<script');
    expect(out).not.toContain('modulepreload');
    expect(out).not.toContain('<!--gyral:components-->');
  });

  it('streams the tail with renderPage, and puts it in the string render too (hashed CSP)', async () => {
    for (const csp of [undefined, { styleAttributes: 'hash' as const }]) {
      const out = await renderPage({
        title: 't',
        body: html`<cl-card></cl-card>`,
        components: assets,
        dev: false,
        ...(csp === undefined ? {} : { csp }),
      }).text();
      expect(out).toContain('src="/assets/components-L.js"');
      expect(out).toContain('href="/assets/card-B.js"');
      expect(out).not.toContain('list-A.js');
    }
  });

  it('warns in development, once, when a rendered component has no client module', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const render = () =>
        renderToString(
          page({ title: 't', body: html`<cl-orphan></cl-orphan>`, components: assets }),
          {
            components: assets,
            dev: true,
          },
        );
      const out = await render();
      await render();
      expect(out).not.toContain('<script');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('<cl-orphan>');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('component assets from a build', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const manifest = {
    '../../packages/core/src/hydration-client.ts': { file: 'assets/hydration-H.js' },
    '_core-C.js': {
      file: 'assets/core-C.js',
      dynamicImports: ['../../packages/core/src/hydration-client.ts'],
    },
    'src/card.ts': { file: 'assets/card-B.js', imports: ['_core-C.js'], css: ['assets/card.css'] },
    'src/list.ts': { file: 'assets/list-A.js', imports: ['_core-C.js', 'src/card.ts'] },
    'virtual:gyral/components': { file: 'assets/components-L.js', isEntry: true },
  };
  const components = {
    loader: 'assets/components-L.js',
    loaderImports: [],
    modules: { 'cl-card': 'src/card.ts', 'cl-list': 'src/list.ts' },
  };

  it("resolve each tag's module with its imports, the hydration chunk and CSS, under base", () => {
    const built = componentAssets(manifest, components, { base: '/app/' });
    expect(built.loader).toBe('/app/assets/components-L.js');
    expect(built.modules.get('cl-list')).toEqual({
      preload: [
        '/app/assets/list-A.js',
        '/app/assets/core-C.js',
        '/app/assets/card-B.js',
        '/app/assets/hydration-H.js',
      ],
      stylesheets: ['/app/assets/card.css'],
    });
  });

  const write = (withComponents: boolean): string => {
    const dist = mkdtempSync(join(tmpdir(), 'gyral-components-'));
    dirs.push(dist);
    mkdirSync(join(dist, 'client', '.vite'), { recursive: true });
    mkdirSync(join(dist, 'client', 'assets'), { recursive: true });
    writeFileSync(join(dist, 'client', '.vite', 'manifest.json'), JSON.stringify(manifest));
    if (withComponents) {
      writeFileSync(
        join(dist, 'client', '.vite', 'gyral-components.json'),
        JSON.stringify(components),
      );
    }
    return dist;
  };

  it('are undefined for a build made without `components`', async () => {
    expect(await componentsFromManifest(join(write(false), 'client'))).toBeUndefined();
  });

  it('reach createApp through productionServer, with no client entry needed', async () => {
    const dist = write(true);
    let seen:
      { clientEntry: string | undefined; components: ComponentAssets | undefined } | undefined;
    const server = await productionServer({
      distDir: dist,
      staticDir: false,
      createApp: ({ clientEntry, components: loaded }) => {
        seen = { clientEntry, components: loaded };
        return { fetch: () => new Response('ok') };
      },
    });
    expect(seen?.clientEntry).toBeUndefined();
    expect(seen?.components?.modules.get('cl-card')?.preload[0]).toBe('/assets/card-B.js');
    expect((await server.fetch(new Request('http://x/'))).status).toBe(200);
  });

  it('still requires a named entry that the manifest lacks', async () => {
    await expect(
      productionServer({
        distDir: write(true),
        entry: 'src/missing.ts',
        createApp: () => ({ fetch: () => new Response('') }),
      }),
    ).rejects.toThrow('src/missing.ts is not an entry');
  });
});
