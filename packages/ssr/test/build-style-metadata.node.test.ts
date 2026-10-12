import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { build } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';
import { assetHandler, writeComponentStyleManifest } from '../src/static.js';
import { toNodeListener } from '../src/node.js';
interface Metadata {
  readonly schema: number;
  readonly hashes: readonly string[];
}
interface App {
  styleMetadata(): Promise<Metadata>;
  response(script: string, hashes: readonly string[]): Response;
}

it('writes deterministic build hashes and verifies strict-header first paint, hydration, nesting and both themes', async () => {
  const root = mkdtempSync(join(import.meta.dirname, '.tmp-style-metadata-'));
  const fixture = join(root, 'src');
  const client = join(root, 'client');
  try {
    mkdirSync(fixture);
    // Application modules register components by side effect. Do not inherit this library's
    // package sideEffects allowlist for a fixture app living under packages/ssr/test.
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ type: 'module', sideEffects: true }),
    );
    for (const entry of ['csp-card', 'csp-client', 'csp-server', 'csp-policy']) {
      const source = readFileSync(
        join(import.meta.dirname, 'fixtures', `${entry}.ts`),
        'utf8',
      ).replace('../../src/index.js', resolve(import.meta.dirname, '../src/index.ts'));
      writeFileSync(join(fixture, `${entry}.ts`), source);
    }
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      ...gyralVitePreset({ components: true }),
      build: { outDir: client, rolldownOptions: { input: join(fixture, 'csp-client.ts') } },
    });
    for (const entry of ['csp-server', 'csp-policy'])
      await build({
        root,
        configFile: false,
        logLevel: 'silent',
        ...gyralVitePreset(),
        ssr: { noExternal: ['@gyral/core', '@gyral/ssr'] },
        build: {
          ssr: join(fixture, `${entry}.ts`),
          outDir: join(root, entry),
          rolldownOptions: { output: { codeSplitting: false } },
        },
      });
    const app = (await import(
      pathToFileURL(join(root, 'csp-server', 'csp-server.js')).href
    )) as App;
    const metadata = await writeComponentStyleManifest({
      root,
      clientDir: client,
      outFile: join(root, 'component-styles.json'),
    });
    const text = JSON.stringify(metadata) + '\n';
    expect(readFileSync(join(root, 'component-styles.json'), 'utf8')).toBe(text);
    await writeComponentStyleManifest({
      root,
      clientDir: client,
      outFile: join(root, 'component-styles.json'),
    });
    expect(readFileSync(join(root, 'component-styles.json'), 'utf8')).toBe(text);
    expect(JSON.stringify(await app.styleMetadata()) + '\n').toBe(text);
    expect(metadata.schema).toBe(1);
    expect(metadata.hashes).toHaveLength(1);
    expect(metadata.hashes[0]).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/u);
    const policyBundle = readFileSync(join(root, 'csp-policy', 'csp-policy.js'), 'utf8');
    expect(policyBundle).not.toContain('csp-fixture-card');
    expect(policyBundle).not.toContain('Nested component styles');
    const policy = (await import(
      pathToFileURL(join(root, 'csp-policy', 'csp-policy.js')).href
    )) as { policy(hashes: readonly string[]): Promise<string> };
    const restored = JSON.parse(
      readFileSync(join(root, 'component-styles.json'), 'utf8'),
    ) as Metadata;
    const header = await policy.policy(restored.hashes);
    expect(header).toContain(restored.hashes[0]);
    expect(header).not.toContain('unsafe-inline');
    const script = readdirSync(join(client, 'assets')).find(
      (file) => file.startsWith('csp-client-') && file.endsWith('.js'),
    );
    if (script === undefined) throw new Error('Expected client chunk');
    const assets = assetHandler({ dir: join(client, 'assets') });
    const server = createServer(
      toNodeListener(
        async (request) =>
          (await assets(request)) ?? app.response(`/assets/${script}`, restored.hashes),
      ),
    );
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected server address');
    const origin = `http://127.0.0.1:${String(address.port)}`;
    const browser = await chromium.launch();
    try {
      for (const theme of ['light', 'dark'] as const) {
        const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: theme });
        const page = await context.newPage();
        await page.goto(origin);
        const values = await page.locator('csp-fixture-card p').evaluateAll((nodes) =>
          nodes.map((el) => ({
            color: getComputedStyle(el).color,
            width: getComputedStyle(el).inlineSize,
          })),
        );
        expect(values).toEqual([
          { color: theme === 'light' ? 'rgb(10, 20, 30)' : 'rgb(210, 220, 230)', width: '120px' },
          { color: 'rgb(100, 110, 120)', width: '120px' },
        ]);
        await context.close();
      }
      const page = await browser.newPage();
      const violations: string[] = [];
      await page.exposeFunction('recordViolation', (directive: string) =>
        violations.push(directive),
      );
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          void (Reflect.get(window, 'recordViolation') as (value: string) => Promise<void>)(
            event.violatedDirective,
          );
        });
      });
      await page.goto(origin);
      await page.locator('html[data-ready="true"]').waitFor();
      await page.locator('csp-fixture-card').first().getByRole('button', { name: 'Grow' }).click();
      await expect
        .poll(() =>
          page
            .locator('csp-fixture-card p')
            .first()
            .evaluate((el) => getComputedStyle(el).inlineSize),
        )
        .toBe('180px');
      expect(violations).toEqual([]);
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
