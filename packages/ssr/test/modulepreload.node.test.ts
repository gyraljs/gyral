// gyral-g1r.21: server-rendered pages preload what the client entry needs (its static imports
// and core's lazily loaded hydration chunk), read from the Vite manifest, so hydration doesn't
// wait for extra round trips (view/07-hydration.md "Loading").
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { page, renderToString } from '../src/index.js';
import {
  clientAssets,
  clientAssetsFromManifest,
  productionServer,
  type ViteManifest,
} from '../src/static.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The shape of the isomorphic example's manifest, built from this repository's sources. */
const workspace: ViteManifest = {
  '../../packages/core/src/hydration-client.ts': {
    file: 'assets/hydration-client-B8.js',
    imports: ['_render-bG.js'],
  },
  '../../packages/core/src/invokers-shim.ts': { file: 'assets/invokers-shim-CV.js' },
  '_define-D8.js': {
    file: 'assets/define-D8.js',
    imports: ['_render-bG.js'],
    dynamicImports: [
      '../../packages/core/src/invokers-shim.ts',
      '../../packages/core/src/hydration-client.ts',
    ],
  },
  '_render-bG.js': { file: 'assets/render-bG.js' },
  'src/contact.ts': { file: 'assets/contact-DV.js', imports: ['_render-bG.js', '_define-D8.js'] },
  'src/entry-client.ts': {
    file: 'assets/entry-client-Dc.js',
    imports: ['_render-bG.js', '_define-D8.js'],
    dynamicImports: ['src/contact.ts'],
  },
};

describe('clientAssets (gyral-g1r.21)', () => {
  it("preloads the entry's static imports and the hydration chunk, nothing lazy of the app's", () => {
    expect(clientAssets(workspace, 'src/entry-client.ts')).toEqual({
      entry: '/assets/entry-client-Dc.js',
      modulepreload: [
        '/assets/render-bG.js',
        '/assets/define-D8.js',
        '/assets/hydration-client-B8.js',
      ],
    });
  });

  it('finds the hydration chunk in an installed @gyral/core (npm and pnpm layouts)', () => {
    for (const key of [
      'node_modules/@gyral/core/dist/hydration-client.js',
      'node_modules/.pnpm/@gyral+core@0.3.0/node_modules/@gyral/core/dist/hydration-client.js',
    ]) {
      const manifest: ViteManifest = {
        [key]: { file: 'assets/hydration-client-X.js', imports: ['_dep.js'] },
        '_dep.js': { file: 'assets/dep.js' },
        'src/main.ts': { file: 'assets/main.js', dynamicImports: [key] },
      };
      expect(clientAssets(manifest, 'src/main.ts').modulepreload).toEqual([
        '/assets/dep.js',
        '/assets/hydration-client-X.js',
      ]);
    }
  });

  it('preloads lazily imported modules named in `also`, with their imports, once', () => {
    const lazy: ViteManifest = {
      ...workspace,
      'src/contact.ts': { file: 'assets/contact-DV.js', imports: ['_render-bG.js', '_form.js'] },
      '_form.js': { file: 'assets/form.js' },
    };
    expect(clientAssets(lazy, 'src/entry-client.ts', ['src/contact.ts']).modulepreload).toEqual([
      '/assets/render-bG.js',
      '/assets/define-D8.js',
      '/assets/hydration-client-B8.js',
      '/assets/form.js',
      '/assets/contact-DV.js',
    ]);
    expect(() => clientAssets(lazy, 'src/entry-client.ts', ['src/nope.ts'])).toThrow(
      /src\/nope\.ts is not a module in the Vite manifest/,
    );
  });

  it('preloads nothing extra for an entry without imports, and handles import cycles', () => {
    expect(clientAssets({ 'a.ts': { file: 'a.js' } }, 'a.ts')).toEqual({
      entry: '/a.js',
      modulepreload: [],
    });
    const cycle: ViteManifest = {
      'a.ts': { file: 'a.js', imports: ['_b.js'] },
      '_b.js': { file: 'b.js', imports: ['_c.js'] },
      '_c.js': { file: 'c.js', imports: ['_b.js', 'a.ts'] },
    };
    expect(clientAssets(cycle, 'a.ts').modulepreload).toEqual(['/c.js', '/b.js']);
    expect(() => clientAssets(cycle, 'missing.ts')).toThrow(/not an entry/);
  });
});

describe('modulepreload on the page', () => {
  it('writes <link rel="modulepreload"> before the module scripts', async () => {
    const out = await renderToString(
      page({
        title: 't',
        body: html`<p>hi</p>`,
        modulepreload: ['/assets/render-bG.js', '/assets/hydration-client-B8.js'],
        scripts: ['/assets/entry-client-Dc.js'],
      }),
    );
    const links = '<link rel="modulepreload" href="/assets/render-bG.js">';
    expect(out).toContain(links);
    expect(out).toContain('<link rel="modulepreload" href="/assets/hydration-client-B8.js">');
    expect(out.indexOf(links)).toBeLessThan(out.indexOf('<script type="module"'));
  });

  it('productionServer hands the manifest’s preloads to createApp', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'gyral-preload-'));
    dirs.push(dist);
    mkdirSync(join(dist, 'client', '.vite'), { recursive: true });
    const manifest = join(dist, 'client', '.vite', 'manifest.json');
    writeFileSync(manifest, JSON.stringify(workspace));
    await expect(clientAssetsFromManifest(manifest, 'src/other.ts')).rejects.toThrow(
      /not an entry in .*manifest\.json/,
    );
    const seen: unknown[] = [];
    await productionServer({
      distDir: dist,
      createApp: (options) => {
        seen.push(options);
        return { fetch: () => new Response('') };
      },
    });
    const [first] = seen as [Record<string, unknown>];
    const { preload, ...rest } = first;
    expect(rest).toEqual(toAppOptions(clientAssets(workspace, 'src/entry-client.ts')));
    if (typeof preload !== 'function') throw new Error('no preload');
    // A page with a lazily imported route module preloads it and its imports too.
    const urls = preload as (modules: readonly string[]) => readonly string[];
    expect(urls(['src/contact.ts'])).toEqual(
      clientAssets(workspace, 'src/entry-client.ts', ['src/contact.ts']).modulepreload,
    );
    expect(urls(['src/contact.ts'])).toBe(urls(['src/contact.ts'])); // cached
  });
});

const toAppOptions = ({ entry, modulepreload }: ReturnType<typeof clientAssets>) => ({
  clientEntry: entry,
  modulepreload,
});
