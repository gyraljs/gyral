// Automatic component loading next to the page's own links (gyral-9b0): the components tail
// leaves out every URL the head already loads, and links each of its own once. The loader
// imports the client entry, so a component folded into the entry chunk preloads the entry's
// whole graph, which the head already preloads.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { define, html } from '@gyral/core';
import { renderPage, renderToString, type ComponentAssets } from '../src/index.js';
import { componentTail } from '../src/components.js';
import { page } from '../src/page.js';
import { productionServer } from '../src/static.js';

define()('hd-cart', { init: () => ({}), intent: {}, update: {}, view: () => html`<p>cart</p>` });
define()('hd-card', { init: () => ({}), intent: {}, update: {}, view: () => html`<p>card</p>` });

/** Every URL the document links, by kind, in document order. */
const links = (out: string) => ({
  modulepreload: [...out.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]),
  stylesheets: [...out.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]),
  scripts: [...out.matchAll(/<script type="module" src="([^"]+)"/g)].map((m) => m[1]),
});

const expectEachOnce = (out: string): void => {
  for (const [kind, urls] of Object.entries(links(out))) {
    expect(urls, kind).toEqual([...new Set(urls)]);
  }
};

const head = {
  scripts: ['/assets/entry-E.js'],
  modulepreload: ['/assets/entry-E.js', '/assets/core-C.js', '/assets/helper-P.js'],
  stylesheets: ['/assets/core.css'],
};

// The cart is folded into the entry chunk: its preloads are the entry's graph.
const assets: ComponentAssets = {
  loader: '/assets/components-L.js',
  preload: ['/assets/helper-P.js'],
  modules: new Map([
    ['hd-cart', { preload: head.modulepreload, stylesheets: ['/assets/core.css'] }],
    [
      'hd-card',
      {
        preload: ['/assets/card-B.js', '/assets/core-C.js', '/assets/helper-P.js'],
        stylesheets: ['/assets/core.css', '/assets/card.css'],
      },
    ],
  ]),
};

const body = html`<main><hd-cart></hd-cart><hd-card></hd-card></main>`;
const options = { title: 't', body, components: assets, dev: false, ...head };
const tailOf = (out: string): string => out.slice(out.indexOf('</main>'));

describe('the components tail next to the head', () => {
  it('leaves out what the head links, in renderToString, renderPage and its string render', async () => {
    const outs = [
      await renderToString(page(options), { components: assets, dev: false }),
      await renderPage(options).text(),
      await renderPage({ ...options, csp: { styleAttributes: 'hash' } }).text(),
      await renderPage({ ...options, onError: 'throw' }).text(),
    ];
    for (const out of outs) {
      expectEachOnce(out);
      expect(links(out)).toEqual({
        modulepreload: [...head.modulepreload, '/assets/card-B.js'],
        stylesheets: ['/assets/core.css', '/assets/card.css'],
        scripts: ['/assets/entry-E.js', '/assets/components-L.js'],
      });
      expect(
        tailOf(out).startsWith(
          '</main><link rel="stylesheet" href="/assets/card.css">' +
            '<link rel="modulepreload" href="/assets/card-B.js">' +
            '<script type="module" src="/assets/components-L.js"></script>',
        ),
      ).toBe(true);
      expect(out).not.toContain('gyral:components');
    }
  });

  it('keeps the whole tail when the head links nothing', async () => {
    const out = await renderPage({ title: 't', body, components: assets, dev: false }).text();
    expectEachOnce(out);
    expect(links(out).modulepreload).toEqual([
      '/assets/helper-P.js',
      '/assets/entry-E.js',
      '/assets/core-C.js',
      '/assets/card-B.js',
    ]);
  });

  it('runs a script once when the head already runs it (development: the Vite client)', async () => {
    const dev: ComponentAssets = {
      loader: '/@id/virtual:gyral/components',
      modules: new Map([['hd-card', { preload: [], stylesheets: [] }]]),
      scripts: ['/@vite/client'],
    };
    const out = await renderPage({
      title: 't',
      body,
      components: dev,
      dev: false,
      scripts: ['/@vite/client', '/src/entry.ts'],
    }).text();
    expect(links(out).scripts).toEqual([
      '/@vite/client',
      '/src/entry.ts',
      '/@id/virtual:gyral/components',
    ]);
  });

  it('links each of its own URLs once, and never preloads a module it runs', () => {
    const tail = componentTail(
      {
        loader: '/l.js',
        preload: ['/l.js', '/a.js'],
        modules: new Map([['hd-card', { preload: ['/a.js', '/b.js'], stylesheets: [] }]]),
        scripts: ['/s.js', '/s.js'],
      },
      new Set(['hd-card']),
      false,
      { modulepreload: ['/b.js'] },
    );
    expect(tail).toBe(
      '<link rel="modulepreload" href="/a.js">' +
        '<script type="module" src="/s.js"></script><script type="module" src="/l.js"></script>',
    );
  });
});

describe('the components tail from a Vite build', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  // What Vite and the preset write when a component is folded into the entry chunk (no
  // manifest key of its own; `chunks` names the entry's file) and another has its own chunk.
  const manifest = {
    'src/entry-client.ts': {
      file: 'assets/entry-E.js',
      isEntry: true,
      imports: ['_core-C.js', '_store-S.js'],
      dynamicImports: ['node_modules/@gyral/core/dist/hydration-client.js'],
    },
    'node_modules/@gyral/core/dist/hydration-client.js': {
      file: 'assets/hydration-H.js',
      imports: ['_core-C.js'],
    },
    '_core-C.js': { file: 'assets/core-C.js', imports: ['_helper-P.js'], css: ['assets/core.css'] },
    '_store-S.js': { file: 'assets/store-S.js', imports: ['_core-C.js'] },
    '_helper-P.js': { file: 'assets/helper-P.js' },
    'src/card.ts': { file: 'assets/card-B.js', imports: ['_core-C.js'], css: ['assets/card.css'] },
    'virtual:gyral/components': { file: 'assets/components-L.js', imports: ['_helper-P.js'] },
  };
  const components = {
    loader: 'assets/components-L.js',
    loaderImports: ['assets/helper-P.js'],
    modules: { 'hd-cart': 'src/cart.ts', 'hd-card': 'src/card.ts' },
    chunks: { 'hd-cart': 'assets/entry-E.js', 'hd-card': 'assets/card-B.js' },
  };

  const write = (): string => {
    const dist = mkdtempSync(join(tmpdir(), 'gyral-components-head-'));
    dirs.push(dist);
    mkdirSync(join(dist, 'client', '.vite'), { recursive: true });
    mkdirSync(join(dist, 'client', 'assets'), { recursive: true });
    writeFileSync(join(dist, 'client', '.vite', 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(
      join(dist, 'client', '.vite', 'gyral-components.json'),
      JSON.stringify(components),
    );
    return dist;
  };

  it('links every module, stylesheet and script once through productionServer', async () => {
    const server = await productionServer({
      distDir: write(),
      staticDir: false,
      createApp: ({ clientEntry, modulepreload, stylesheets, components: loaded }) => ({
        fetch: () =>
          renderPage({
            title: 't',
            body,
            dev: false,
            scripts: clientEntry === undefined ? [] : [clientEntry],
            modulepreload,
            stylesheets,
            ...(loaded === undefined ? {} : { components: loaded }),
          }),
      }),
    });
    const out = await (await server.fetch(new Request('http://x/'))).text();
    expectEachOnce(out);
    const headPart = links(out.slice(0, out.indexOf('<body>')));
    const tail = links(tailOf(out));
    // The head is unchanged, the entry first; the tail adds only the card's own chunk and CSS.
    expect(headPart.modulepreload).toEqual([
      '/assets/entry-E.js',
      '/assets/helper-P.js',
      '/assets/core-C.js',
      '/assets/store-S.js',
      '/assets/hydration-H.js',
    ]);
    expect(tail).toEqual({
      modulepreload: ['/assets/card-B.js'],
      stylesheets: ['/assets/card.css'],
      scripts: ['/assets/components-L.js'],
    });
  });
});
