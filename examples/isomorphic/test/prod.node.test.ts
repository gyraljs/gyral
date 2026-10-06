// Production pipeline smoke test (gyral-4k7.3): a real Vite client build, the prerender step,
// then the production server answering requests.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prerenderSite } from '../server/prerender.js';
import type { FetchApp } from '@gyral/ssr/static';
import { createProdApp } from '../server/prod-app.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = mkdtempSync(join(tmpdir(), 'gyral-iso-'));
let app: FetchApp;
let prerendered: readonly string[] = [];
const req = async (path: string): Promise<Response> =>
  app.fetch(new Request(new URL(path, 'http://localhost')));

beforeAll(async () => {
  await build({
    root,
    configFile: join(root, 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir: join(dist, 'client') },
  });
  prerendered = await prerenderSite(dist);
  app = await createProdApp({ distDir: dist });
}, 60_000);

afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
});

// Re-enable in Phase 4/5 (gyral-g1r.9 / gyral-g1r.10): needs the Gyral server renderer / hydration.
describe.skip('isomorphic production build', () => {
  it('prerenders exactly the ssg routes to static HTML', () => {
    expect(prerendered).toEqual(['/']);
    const html = readFileSync(join(dist, 'static', 'index.html'), 'utf8');
    expect(html).toContain('shadowrootmode="open"'); // a full server render, DSD included
    expect(html).toMatch(/src="\/assets\/entry-client-[\w-]+\.js"/);
  });

  it('serves prerendered pages from disk with revalidation', async () => {
    const res = await req('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(await res.text()).toBe(readFileSync(join(dist, 'static', 'index.html'), 'utf8'));
  });

  it('renders ssr routes per request with the hashed client entry', async () => {
    const res = await req('/about');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    const html = await res.text();
    expect(html).toContain('Read more about us');
    expect(html).toMatch(/src="\/assets\/entry-client-[\w-]+\.js"/);
  });

  it('serves hashed assets as immutable JavaScript', async () => {
    const html = await (await req('/about')).text();
    const src = /src="(\/assets\/entry-client-[\w-]+\.js)"/.exec(html)?.[1] ?? '';
    const res = await req(src);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('keeps 404s and refuses paths outside the build', async () => {
    expect((await req('/nope')).status).toBe(404);
    expect((await req('/assets/..%2F..%2Fpackage.json')).status).toBe(404);
  });
});
