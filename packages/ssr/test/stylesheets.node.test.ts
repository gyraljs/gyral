// gyral-dyn.2: hashed stylesheets. `clientAssets` collects the CSS files Vite emitted for the
// entry, its static imports and the `also` modules; `page({ stylesheets })` links them;
// `productionServer` hands them to `createApp`, per lazily imported module set too.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { page, renderToString } from '../src/index.js';
import {
  clientAssets,
  clientAssetsFromManifest,
  productionServer,
  type AppAssets,
  type ViteManifest,
} from '../src/static.js';

const dirs: string[] = [];
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'gyral-css-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const manifest: ViteManifest = {
  'src/entry-client.ts': {
    file: 'assets/entry-client-E.js',
    imports: ['_ui.js', '_theme.js'],
    dynamicImports: ['src/routes/shop.ts'],
    css: ['assets/entry-client-E.css'],
  },
  '_ui.js': { file: 'assets/ui-U.js', imports: ['_theme.js'], css: ['assets/ui-U.css'] },
  '_theme.js': { file: 'assets/theme-T.js', css: ['assets/theme-T.css'] },
  'src/routes/shop.ts': {
    file: 'assets/shop-S.js',
    imports: ['_ui.js', '_cart.js'],
    css: ['assets/shop-S.css', 'assets/theme-T.css'],
  },
  '_cart.js': { file: 'assets/cart-C.js', css: ['assets/cart-C.css'] },
};

describe('clientAssets css (gyral-dyn.2)', () => {
  it("collects the entry's CSS after its imports', each once", () => {
    expect(clientAssets(manifest, 'src/entry-client.ts').css).toEqual([
      '/assets/theme-T.css',
      '/assets/ui-U.css',
      '/assets/entry-client-E.css',
    ]);
  });

  it('adds the CSS of `also` modules and their imports, without lazy CSS otherwise', () => {
    expect(clientAssets(manifest, 'src/entry-client.ts', ['src/routes/shop.ts']).css).toEqual([
      '/assets/theme-T.css',
      '/assets/ui-U.css',
      '/assets/entry-client-E.css',
      '/assets/cart-C.css',
      '/assets/shop-S.css',
    ]);
    expect(clientAssets({ 'a.ts': { file: 'a.js' } }, 'a.ts').css).toEqual([]);
  });
});

describe('page({ stylesheets })', () => {
  it('links the stylesheets before the inline styles', async () => {
    const out = await renderToString(
      page({
        title: 't',
        body: html`<p>hi</p>`,
        stylesheets: ['/assets/a.css', '/assets/b.css'],
        styles: 'p { color: red }',
      }),
    );
    const link = '<link rel="stylesheet" href="/assets/a.css">';
    expect(out).toContain(link);
    expect(out).toContain('<link rel="stylesheet" href="/assets/b.css">');
    expect(out.indexOf(link)).toBeLessThan(out.indexOf('<link rel="stylesheet" href="/assets/b'));
    expect(out.indexOf('/assets/b.css')).toBeLessThan(out.indexOf('<style>'));
  });
});

describe('productionServer stylesheets', () => {
  it('hands createApp the stylesheets and assets(modules) with their CSS', async () => {
    const dist = tmp();
    mkdirSync(join(dist, 'client', '.vite'), { recursive: true });
    writeFileSync(join(dist, 'client', '.vite', 'manifest.json'), JSON.stringify(manifest));
    let given: AppAssets | undefined;
    await productionServer({
      distDir: dist,
      staticDir: false,
      createApp: (options) => {
        given = options;
        return { fetch: () => new Response('') };
      },
    });
    if (given === undefined) throw new Error('createApp was not called');
    const plain = clientAssets(manifest, 'src/entry-client.ts');
    const shop = clientAssets(manifest, 'src/entry-client.ts', ['src/routes/shop.ts']);
    expect(given.stylesheets).toEqual(plain.css);
    expect(given.assets(['src/routes/shop.ts'])).toEqual({
      modulepreload: shop.modulepreload,
      stylesheets: shop.css,
    });
    expect(given.assets(['src/routes/shop.ts'])).toBe(given.assets(['src/routes/shop.ts']));
    expect(given.preload(['src/routes/shop.ts'])).toEqual(shop.modulepreload);
  });
});

describe('a real Vite build with CSS', () => {
  it('links the hashed CSS the entry imports and serves it', async () => {
    const root = tmp();
    const dist = tmp();
    writeFileSync(join(root, 'entry.js'), "import './entry.css';\nawait import('./lazy.js');\n");
    writeFileSync(join(root, 'entry.css'), 'body { margin: 0 }\n');
    writeFileSync(join(root, 'lazy.js'), "import './lazy.css';\nexport const lazy = 1;\n");
    writeFileSync(join(root, 'lazy.css'), 'p { color: teal }\n');
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      build: {
        outDir: join(dist, 'client'),
        manifest: true,
        rollupOptions: { input: join(root, 'entry.js') },
      },
    });
    const assets = await clientAssetsFromManifest(
      join(dist, 'client', '.vite', 'manifest.json'),
      'entry.js',
    );
    expect(assets.css).toEqual([expect.stringMatching(/^\/assets\/entry-[\w-]+\.css$/)]);
    const withLazy = await clientAssetsFromManifest(
      join(dist, 'client', '.vite', 'manifest.json'),
      'entry.js',
      ['lazy.js'],
    );
    expect(withLazy.css).toEqual([
      ...assets.css,
      expect.stringMatching(/^\/assets\/lazy-[\w-]+\.css$/),
    ]);

    const server = await productionServer({
      distDir: dist,
      entry: 'entry.js',
      staticDir: false,
      createApp: ({ clientEntry, modulepreload, stylesheets }) => ({
        fetch: async () =>
          new Response(
            await renderToString(
              page({
                title: 't',
                body: html`<p></p>`,
                scripts: [clientEntry],
                modulepreload,
                stylesheets,
              }),
            ),
          ),
      }),
    });
    const out = await (await server.fetch(new Request('http://x/'))).text();
    const href = /<link rel="stylesheet" href="([^"]+)">/.exec(out)?.[1] ?? '';
    expect(href).toBe(assets.css[0]);
    const css = await server.fetch(new Request(new URL(href, 'http://x')));
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect(await css.text()).toContain('margin');
  }, 60_000);
});
