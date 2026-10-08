// gyral-dyn.1: serving hashed assets (ADR 0016 "Serving assets"): `assetHandler` alone and
// inside `productionServer`.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assetHandler, productionServer, type FetchApp } from '../src/static.js';

const dirs: string[] = [];
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'gyral-assets-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const request = (path: string, method = 'GET'): Request =>
  new Request(new URL(path, 'http://x'), { method });

/** A directory of assets, with a dot directory and a file beside it that must stay private. */
function assetDir(): string {
  const root = tmp();
  const dir = join(root, 'assets');
  mkdirSync(join(dir, '.releases'), { recursive: true });
  mkdirSync(join(dir, 'nested'), { recursive: true });
  for (const name of ['a.js', 'a.mjs', 'a.css', 'a.map', 'a.json', 'a.svg', 'a.png', 'a.webp']) {
    writeFileSync(join(dir, name), name);
  }
  for (const name of ['a.avif', 'a.ico', 'a.woff2', 'a.wasm', 'a.unknown', 'nested/b.js']) {
    writeFileSync(join(dir, name), name);
  }
  writeFileSync(join(dir, '.releases', 'r1.json'), '{}');
  writeFileSync(join(root, 'secret.txt'), 'outside the assets');
  return dir;
}

describe('assetHandler (gyral-dyn.1)', () => {
  it('serves files immutable, with type, length and nosniff', async () => {
    const serve = assetHandler({ dir: assetDir() });
    const res = await serve(request('/assets/nested/b.js'));
    expect(res?.status).toBe(200);
    expect(Object.fromEntries(res?.headers ?? [])).toEqual({
      'cache-control': 'public, max-age=31536000, immutable',
      'content-length': '11',
      'content-type': 'text/javascript; charset=utf-8',
      'x-content-type-options': 'nosniff',
    });
    expect(await res?.text()).toBe('nested/b.js');
  });

  it('knows the types a Vite build emits', async () => {
    const serve = assetHandler({ dir: assetDir() });
    const types: Record<string, string> = {
      'a.js': 'text/javascript; charset=utf-8',
      'a.mjs': 'text/javascript; charset=utf-8',
      'a.css': 'text/css; charset=utf-8',
      'a.map': 'application/json; charset=utf-8',
      'a.json': 'application/json; charset=utf-8',
      'a.svg': 'image/svg+xml',
      'a.png': 'image/png',
      'a.webp': 'image/webp',
      'a.avif': 'image/avif',
      'a.ico': 'image/x-icon',
      'a.woff2': 'font/woff2',
      'a.wasm': 'application/wasm',
      'a.unknown': 'application/octet-stream',
    };
    for (const [name, type] of Object.entries(types)) {
      const res = await serve(request(`/assets/${name}`));
      expect(res?.headers.get('content-type'), name).toBe(type);
    }
  });

  it('answers HEAD with the headers and no body', async () => {
    const serve = assetHandler({ dir: assetDir() });
    const res = await serve(request('/assets/a.css', 'HEAD'));
    expect(res?.status).toBe(200);
    expect(res?.headers.get('content-length')).toBe('5');
    expect(res?.headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect(res?.body).toBeNull();
    expect((await serve(request('/assets/nope.css', 'HEAD')))?.status).toBe(404);
  });

  it('answers 400 for a malformed escape instead of throwing', async () => {
    const serve = assetHandler({ dir: assetDir() });
    const res = await serve(request('/assets/%E0%A4%A'));
    expect(res?.status).toBe(400);
    expect(res?.headers.get('cache-control')).toBe('no-store');
  });

  it('keeps misses out of every cache', async () => {
    const serve = assetHandler({ dir: assetDir() });
    const res = await serve(request('/assets/next-release.js'));
    expect(res?.status).toBe(404);
    expect(res?.headers.get('cache-control')).toBe('no-store');
    expect(res?.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  });

  it('refuses traversal, dot segments, directories and NUL', async () => {
    const serve = assetHandler({ dir: assetDir() });
    for (const path of [
      '/assets/..%2Fsecret.txt',
      '/assets/..%5Csecret.txt',
      '/assets/nested%2F..%2F..%2Fsecret.txt',
      '/assets/%2e%2e%2fsecret.txt',
      '/assets/.releases/r1.json',
      '/assets/%2Ereleases%2Fr1.json',
      '/assets/nested',
      '/assets/',
      '/assets//a.js',
      '/assets/a.js%00',
    ]) {
      expect((await serve(request(path)))?.status, path).toBe(404);
    }
  });

  it('leaves other paths alone and answers other methods 405', async () => {
    const serve = assetHandler({ dir: assetDir() });
    expect(await serve(request('/about'))).toBeUndefined();
    expect(await serve(request('/assetsx/a.js'))).toBeUndefined();
    const post = await serve(request('/assets/a.js', 'POST'));
    expect(post?.status).toBe(405);
    expect(post?.headers.get('allow')).toBe('GET, HEAD');
  });

  it('serves another prefix', async () => {
    const serve = assetHandler({ dir: assetDir(), prefix: '/static/v1/' });
    expect((await serve(request('/static/v1/a.js')))?.status).toBe(200);
    expect(await serve(request('/assets/a.js'))).toBeUndefined();
    expect(() => assetHandler({ dir: '.', prefix: '/assets' })).toThrow(/start and end with/);
  });

  it('keeps hits in memory, up to the bound, and never caches misses', async () => {
    const dir = assetDir();
    const cached = assetHandler({ dir });
    const uncached = assetHandler({ dir, cache: false });
    const bounded = assetHandler({ dir, cache: { maxBytes: 8 } });
    await cached(request('/assets/a.js'));
    await bounded(request('/assets/a.js')); // 4 bytes: fits
    await bounded(request('/assets/a.css')); // 5 more: a.js is dropped
    expect((await cached(request('/assets/late.js')))?.status).toBe(404);
    writeFileSync(join(dir, 'a.js'), 'changed');
    writeFileSync(join(dir, 'a.css'), 'changed');
    writeFileSync(join(dir, 'late.js'), 'arrived with the deploy');
    expect(await (await cached(request('/assets/a.js')))?.text()).toBe('a.js');
    expect(await (await uncached(request('/assets/a.js')))?.text()).toBe('changed');
    expect(await (await bounded(request('/assets/a.css')))?.text()).toBe('a.css');
    expect(await (await bounded(request('/assets/a.js')))?.text()).toBe('changed');
    expect((await cached(request('/assets/late.js')))?.status).toBe(200);
  });

  it('counts a file once when concurrent requests miss it together (gyral-dyn.30)', async () => {
    const dir = assetDir();
    const bounded = assetHandler({ dir, cache: { maxBytes: 10 } });
    await Promise.all([bounded(request('/assets/a.js')), bounded(request('/assets/a.js'))]);
    await bounded(request('/assets/a.css')); // 4 + 5 bytes: both fit
    writeFileSync(join(dir, 'a.js'), 'changed');
    expect(await (await bounded(request('/assets/a.js')))?.text()).toBe('a.js');
  });
});

/** A renderer that answers every request it gets, saying so. */
const app: FetchApp = {
  fetch: (req) => new Response(`app ${req.method} ${new URL(req.url).pathname}`),
};

function build(): string {
  const dist = tmp();
  mkdirSync(join(dist, 'client', '.vite'), { recursive: true });
  mkdirSync(join(dist, 'client', 'assets'), { recursive: true });
  mkdirSync(join(dist, 'static', 'about'), { recursive: true });
  writeFileSync(
    join(dist, 'client', '.vite', 'manifest.json'),
    JSON.stringify({ 'src/entry-client.ts': { file: 'assets/entry.js' } }),
  );
  writeFileSync(join(dist, 'client', 'assets', 'entry.js'), 'built');
  writeFileSync(join(dist, 'static', 'about', 'index.html'), '<p>about</p>');
  return dist;
}

describe('productionServer serving (gyral-dyn.1)', () => {
  it('never lets a malformed asset URL escape fetch', async () => {
    const server = await productionServer({ distDir: build(), createApp: () => app });
    expect((await server.fetch(request('/assets/%E0%A4%A'))).status).toBe(400);
  });

  it('answers HEAD for assets and prerendered pages without a body', async () => {
    const server = await productionServer({ distDir: build(), createApp: () => app });
    const asset = await server.fetch(request('/assets/entry.js', 'HEAD'));
    expect([asset.status, asset.headers.get('content-length'), asset.body]).toEqual([
      200,
      '5',
      null,
    ]);
    const page = await server.fetch(request('/about', 'HEAD'));
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(page.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(page.headers.get('content-length')).toBe('12');
    expect(page.body).toBeNull();
  });

  it('serves assets from assetsDir and pages from staticDir', async () => {
    const dist = build();
    const volume = tmp();
    const pages = tmp();
    writeFileSync(join(volume, 'old-release.js'), 'old');
    writeFileSync(join(pages, 'index.html'), '<p>home</p>');
    const server = await productionServer({
      distDir: dist,
      assetsDir: volume,
      staticDir: pages,
      createApp: () => app,
    });
    expect(await (await server.fetch(request('/assets/old-release.js'))).text()).toBe('old');
    expect((await server.fetch(request('/assets/entry.js'))).status).toBe(404);
    expect(await (await server.fetch(request('/'))).text()).toBe('<p>home</p>');
    expect(await (await server.fetch(request('/about'))).text()).toBe('app GET /about');
  });

  it('skips prerendered pages with staticDir: false', async () => {
    const server = await productionServer({
      distDir: build(),
      staticDir: false,
      createApp: () => app,
    });
    const res = await server.fetch(request('/about'));
    expect(await res.text()).toBe('app GET /about');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });
});
