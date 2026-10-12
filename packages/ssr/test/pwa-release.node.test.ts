import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { assetHandler } from '../src/static.js';
import { toNodeListener } from '../src/node.js';
import { ownership, pwaRelease } from './pwa-fixture.js';

it('retains emitted workspace ownership, shared CSS/workers and old lazy assets across offline release replacement', async () => {
  const root = mkdtempSync(join(import.meta.dirname, '.tmp-offline-release-'));
  try {
    const first = await pwaRelease(root, 'release-one');
    const second = await pwaRelease(root, 'release-two');
    const map = ownership(first);
    const feature = map.chunks['offline-feature'];
    expect(feature).toBeDefined();
    expect(map.chunks['offline-child']).toBe(feature);
    expect(map.chunkModules[feature ?? 'missing']).toContain('workspace/feature/entry.ts');
    expect(map.chunkModules[feature ?? 'missing']).toContain('workspace/feature/child.ts');
    const owners = Object.values(map.chunkModules).flat();
    expect(owners).toContain('workspace/shared.ts');
    expect(owners.every((file) => !file.startsWith('/') && !file.includes(root))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(first, '.vite/manifest.json'), 'utf8')) as Record<
      string,
      { file: string; css?: readonly string[] }
    >;
    expect(Object.values(manifest).some((entry) => (entry.css?.length ?? 0) > 0)).toBe(true);
    let current = first;
    const server = createServer(
      toNodeListener(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === '/sw.js')
          return new Response(readFileSync(join(current, 'sw.js')), {
            headers: { 'content-type': 'text/javascript', 'cache-control': 'no-store' },
          });
        if (url.pathname === '/' || url.pathname === '/index.html')
          return new Response(readFileSync(join(current, 'index.html')), {
            headers: { 'content-type': 'text/html', 'cache-control': 'no-store' },
          });
        return (
          (await assetHandler({ dir: join(current, 'assets') })(request)) ??
          new Response('', { status: 404 })
        );
      }),
    );
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing address');
    const origin = `http://127.0.0.1:${String(address.port)}`;
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      const oldTab = await context.newPage();
      const errors: string[] = [];
      oldTab.on('pageerror', (error) => errors.push(error.message));
      await oldTab.goto(origin);
      await oldTab.locator('html[data-ready="true"]').waitFor();
      await expect
        .poll(() => oldTab.evaluate(() => navigator.serviceWorker.controller !== null))
        .toBe(true);
      // Cold offline navigation loads cached JS, then a feature never visited online.
      await context.setOffline(true);
      const cold = await context.newPage();
      await cold.goto(origin);
      await cold.getByRole('button', { name: 'Load feature' }).click();
      await cold.getByText('Feature release-one', { exact: true }).waitFor();
      await cold.getByText('Grouped child', { exact: true }).waitFor();
      await cold.locator('html[data-worker="release-one"]').waitFor();
      expect(await cold.locator('link[rel="stylesheet"]').count()).toBeGreaterThan(0);
      await cold.reload();
      await cold.getByRole('button', { name: 'Load feature' }).click();
      await cold.getByText('Feature release-one', { exact: true }).waitFor();
      await context.setOffline(false);
      current = second;
      await oldTab.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration())?.update();
      });
      const fresh = await context.newPage();
      await fresh.goto(origin);
      await fresh.locator('html[data-ready="true"]').waitFor();
      await expect
        .poll(() =>
          fresh.evaluate(async () => (await caches.keys()).includes('offline-release-two')),
        )
        .toBe(true);
      await expect
        .poll(() =>
          fresh.evaluate(
            async () => (await navigator.serviceWorker.getRegistration())?.waiting === null,
          ),
        )
        .toBe(true);
      await context.setOffline(true);
      // Current worker finds old hashed imports in the retained release-one cache.
      await oldTab.getByRole('button', { name: 'Load feature' }).click();
      await oldTab.getByText('Feature release-one', { exact: true }).waitFor();
      await oldTab.locator('html[data-worker="release-one"]').waitFor();
      await fresh.getByRole('button', { name: 'Load feature' }).click();
      await fresh.getByText('Feature release-two', { exact: true }).waitFor();
      await fresh.locator('html[data-worker="release-two"]').waitFor();
      expect(errors).toEqual([]);
      await context.close();
    } finally {
      await browser.close();
      await new Promise<void>((ok, fail) =>
        server.close((error) => {
          if (error === undefined) ok();
          else fail(error);
        }),
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);
