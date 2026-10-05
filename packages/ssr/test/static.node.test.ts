import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clientEntryFromManifest,
  prerender,
  productionServer,
  staticFileFor,
  type FetchApp,
} from '../src/static.js';

const dirs: string[] = [];
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'gyral-static-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A renderer that echoes the method and path, like any request-time app would. */
const echo = (clientEntry: string): FetchApp => ({
  fetch: (request) => {
    const { pathname } = new URL(request.url);
    if (pathname === '/missing') return new Response('nope', { status: 404 });
    return new Response(`<p>${request.method} ${pathname} ${clientEntry}</p>`, {
      headers: { 'content-type': 'text/html' },
    });
  },
});

function fakeBuild(dist: string): void {
  mkdirSync(join(dist, 'client', '.vite'), { recursive: true });
  mkdirSync(join(dist, 'client', 'assets'), { recursive: true });
  writeFileSync(
    join(dist, 'client', '.vite', 'manifest.json'),
    JSON.stringify({ 'src/entry-client.ts': { file: 'assets/entry-AbC1.js' } }),
  );
  writeFileSync(join(dist, 'client', 'assets', 'entry-AbC1.js'), 'console.log(1)');
  writeFileSync(join(dist, 'secret.txt'), 'outside the build');
}

describe('@gyral/ssr/static (gyral-4k7.3)', () => {
  it('maps paths to index.html files and refuses traversal', () => {
    expect(staticFileFor('/out', '/')).toBe('/out/index.html');
    expect(staticFileFor('/out', '/a/b/')).toBe('/out/a/b/index.html');
    expect(() => staticFileFor('/out', '/../etc')).toThrow(/unsafe/);
  });

  it('prerenders through the app and writes each page', async () => {
    const out = tmp();
    const pages = await prerender({ app: echo('/e.js'), paths: ['/', '/about'], outDir: out });
    expect(pages.map((p) => p.path)).toEqual(['/', '/about']);
    expect(readFileSync(join(out, 'about', 'index.html'), 'utf8')).toBe('<p>GET /about /e.js</p>');
  });

  it('fails the build when an ssg route does not render 200', async () => {
    await expect(prerender({ app: echo(''), paths: ['/missing'], outDir: tmp() })).rejects.toThrow(
      /expected 200, got 404/,
    );
  });

  it('reads the hashed client entry from the Vite manifest', async () => {
    const dist = tmp();
    fakeBuild(dist);
    const manifest = join(dist, 'client', '.vite', 'manifest.json');
    await expect(clientEntryFromManifest(manifest, 'src/entry-client.ts')).resolves.toBe(
      '/assets/entry-AbC1.js',
    );
    await expect(clientEntryFromManifest(manifest, 'src/other.ts')).rejects.toThrow(/not an entry/);
  });

  it('serves assets, prerendered pages and per-request renders with their cache policies', async () => {
    const dist = tmp();
    fakeBuild(dist);
    await prerender({
      app: echo('/assets/entry-AbC1.js'),
      paths: ['/'],
      outDir: join(dist, 'static'),
    });
    const server = await productionServer({
      distDir: dist,
      createApp: ({ clientEntry }) => echo(clientEntry),
    });
    const get = (path: string, method = 'GET') =>
      server.fetch(new Request(new URL(path, 'http://x'), { method }));

    const asset = await get('/assets/entry-AbC1.js');
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(asset.headers.get('content-type')).toContain('text/javascript');

    const home = await get('/');
    expect(home.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(await home.text()).toBe('<p>GET / /assets/entry-AbC1.js</p>');

    const about = await get('/about');
    expect(about.headers.get('cache-control')).toBe('no-cache');
    expect(await about.text()).toBe('<p>GET /about /assets/entry-AbC1.js</p>');

    const post = await get('/', 'POST'); // never served from the static file
    expect(await post.text()).toBe('<p>POST / /assets/entry-AbC1.js</p>');

    expect((await get('/assets/missing.js')).status).toBe(404);
    expect((await get('/assets/..%2F..%2Fsecret.txt')).status).toBe(404);
  });
});
