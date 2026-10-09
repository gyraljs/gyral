// Vite's `base` (gyral-dyn.32): the manifest's paths omit it, so the entry, preload and
// stylesheet URLs, and the asset prefix `productionServer` serves, add it.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clientAssets,
  clientAssetsFromManifest,
  clientEntryFromManifest,
  productionServer,
  type AppAssets,
  type ViteManifest,
} from '../src/static.js';

const manifest: ViteManifest = {
  'src/entry-client.ts': {
    file: 'assets/entry-E.js',
    imports: ['_ui.js'],
    css: ['assets/entry-E.css'],
  },
  '_ui.js': { file: 'assets/ui-U.js' },
};

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function dist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gyral-base-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'client', '.vite'), { recursive: true });
  mkdirSync(join(dir, 'client', 'assets'), { recursive: true });
  writeFileSync(join(dir, 'client', '.vite', 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(dir, 'client', 'assets', 'entry-E.js'), 'export {};\n');
  return dir;
}

describe('Vite base', () => {
  it('starts every URL with the base, with or without its slashes', () => {
    for (const base of ['/app/', '/app', 'app/']) {
      expect(clientAssets(manifest, 'src/entry-client.ts', [], { base })).toEqual({
        entry: '/app/assets/entry-E.js',
        modulepreload: ['/app/assets/entry-E.js', '/app/assets/ui-U.js'],
        css: ['/app/assets/entry-E.css'],
      });
    }
    expect(clientAssets(manifest, 'src/entry-client.ts').entry).toBe('/assets/entry-E.js');
  });

  it('the file readers take it too', async () => {
    const path = join(dist(), 'client', '.vite', 'manifest.json');
    expect(await clientEntryFromManifest(path, 'src/entry-client.ts', { base: '/app/' })).toBe(
      '/app/assets/entry-E.js',
    );
    const assets = await clientAssetsFromManifest(path, 'src/entry-client.ts', [], {
      base: '/app/',
    });
    expect(assets.css).toEqual(['/app/assets/entry-E.css']);
  });

  it('productionServer links and serves under the base', async () => {
    let given: AppAssets | undefined;
    const server = await productionServer({
      distDir: dist(),
      staticDir: false,
      base: '/app/',
      createApp: (options) => {
        given = options;
        return { fetch: () => new Response('app') };
      },
    });
    expect(given?.clientEntry).toBe('/app/assets/entry-E.js');
    expect(given?.stylesheets).toEqual(['/app/assets/entry-E.css']);
    const asset = await server.fetch(new Request('http://x/app/assets/entry-E.js'), undefined);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe('export {};\n');
    const outside = await server.fetch(new Request('http://x/assets/entry-E.js'), undefined);
    expect(await outside.text()).toBe('app');
  });
});
