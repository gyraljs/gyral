// The loader's JS preload lists are redundant with renderPage, but CSS must still load
// before a component added after SSR registers (gyral-1zd.31).
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { build, preview } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

it('loads a late component’s static CSS dependencies and reuses an SSR stylesheet', async () => {
  const root = mkdtempSync(join(import.meta.dirname, '.tmp-components-css-'));
  const dist = join(root, 'dist');
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module', sideEffects: true }));
  writeFileSync(join(root, 'src/dependency.ts'), "import './lazy.css';");
  writeFileSync(join(root, 'src/lazy.css'), '.probe { color: rgb(12, 34, 56); }');
  writeFileSync(
    join(root, 'src/lazy.ts'),
    `
    import { define, html } from '@gyral/core';
    import './dependency.js';
    export const Lazy = define()('css-lazy', { init: () => ({}), view: () => html\`<p>lazy</p>\` });
  `,
  );
  let server: Awaited<ReturnType<typeof preview>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      ...gyralVitePreset({ components: true }),
      build: { outDir: dist },
    });
    const written = JSON.parse(readFileSync(join(dist, '.vite/gyral-components.json'), 'utf8')) as {
      loader: string;
    };
    const loader = readFileSync(join(dist, written.loader), 'utf8');
    expect(loader).toContain('.css');
    writeFileSync(
      join(dist, 'index.html'),
      `<p class="probe">CSS probe</p><script type="module" src="/${written.loader}"></script>`,
    );
    server = await preview({
      root,
      configFile: false,
      logLevel: 'silent',
      build: { outDir: dist },
      preview: { port: 0 },
    });
    const base = server.resolvedUrls?.local[0];
    if (base === undefined) throw new Error('preview has no URL');
    browser = await chromium.launch();
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    expect(await page.locator('link[rel="stylesheet"]').count()).toBe(0);
    await page.evaluate(async () => {
      document.body.append(document.createElement('css-lazy'));
      const runtime = Reflect.get(globalThis, Symbol.for('gyral.components')) as {
        ready: () => Promise<void>;
      };
      await runtime.ready();
    });
    expect(await page.locator('.probe').evaluate((node) => getComputedStyle(node).color)).toBe(
      'rgb(12, 34, 56)',
    );
    expect(await page.locator('css-lazy p').textContent()).toBe('lazy');
    const href = await page.locator('link[rel="stylesheet"]').getAttribute('href');
    // With the same stylesheet already linked by SSR, Vite does not add it again.
    writeFileSync(
      join(dist, 'index.html'),
      `<link rel="stylesheet" href="${href ?? ''}"><css-lazy></css-lazy><p class="probe">CSS probe</p><script type="module" src="/${written.loader}"></script>`,
    );
    await page.reload({ waitUntil: 'networkidle' });
    expect(await page.locator('link[rel="stylesheet"]').count()).toBe(1);
    expect(await page.locator('.probe').evaluate((node) => getComputedStyle(node).color)).toBe(
      'rgb(12, 34, 56)',
    );
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    await new Promise<void>((resolve, reject) => {
      if (server === undefined) resolve();
      else
        server.httpServer.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
    });
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);
