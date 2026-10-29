// gyral()'s pre-bundling beyond Gyral's own packages (gyral-337.3, src/compiler/one-core.ts): the
// app's dependencies that use Gyral are pre-bundled with core, and `optimize: 'auto'` points
// Vite's startup scan at the modules that define components, by default on a custom server.
import { rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { resolveConfig, type InlineConfig } from 'vite';
import { afterEach, expect, it } from 'vitest';
import { libraryEntries } from '../../src/compiler/one-core.js';
import { gyral, gyralVitePreset, type GyralViteOptions } from '../../src/vite.js';
import { app } from './fixture.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const json = (value: object): string => JSON.stringify(value);

/** An app with core, a design system on top of it, and packages that must not be bundled. */
function libraryApp(): string {
  const root = app({
    'package.json': json({
      name: 'app',
      dependencies: {
        '@gyral/core': '0.3.8',
        'design-system': '1.0.0',
        'server-adapter': '1.0.0',
        'left-pad': '1.0.0',
        'linked-widgets': 'link:',
      },
      devDependencies: { 'test-widgets': '1.0.0' },
    }),
    'node_modules/@gyral/core/package.json': json({ name: '@gyral/core', version: '0.3.8' }),
    'node_modules/design-system/package.json': json({
      name: 'design-system',
      peerDependencies: { '@gyral/core': '^0.3.8' },
      exports: {
        '.': './index.js',
        './button': { types: './button.d.ts', import: './button.js' },
        './node': { node: './node.js' }, // a Node-only entry
        './types': { types: './types.d.ts' }, // types only
        './icons/*': './icons/*.js', // a pattern
        './package.json': './package.json',
      },
    }),
    // Uses only @gyral/ssr: server code, never loaded by a page.
    'node_modules/server-adapter/package.json': json({
      name: 'server-adapter',
      dependencies: { '@gyral/ssr': '0.3.8' },
    }),
    'node_modules/left-pad/package.json': json({ name: 'left-pad' }),
    'node_modules/test-widgets/package.json': json({
      name: 'test-widgets',
      dependencies: { '@gyral/testing': '0.3.8' },
    }),
    'checkout/linked-widgets/package.json': json({
      name: 'linked-widgets',
      peerDependencies: { '@gyral/core': '^0.3.8' },
    }),
    'src/card.ts':
      "import { define } from '@gyral/core';\nexport const Card = define()('app-card', {});\n",
    'src/util.ts': 'export const answer = 42;\n',
    'src/server/app.ts': "import { Hono } from 'hono';\nexport const app = new Hono();\n",
  });
  symlinkSync(join(root, 'checkout/linked-widgets'), join(root, 'node_modules/linked-widgets'));
  roots.push(root);
  return root;
}

it("lists the browser entry points of the app's installed dependencies that use Gyral", () => {
  expect(libraryEntries(libraryApp())).toEqual([
    'design-system',
    'design-system/button',
    'test-widgets',
  ]);
});

/** `optimizeDeps` as Vite resolves it in dev, with `gyral(options)` and the app's `config`. */
async function optimizeDeps(
  root: string,
  options: GyralViteOptions = {},
  config: InlineConfig = {},
): Promise<{ include: readonly string[]; entries: readonly string[] | undefined }> {
  const resolved = await resolveConfig(
    {
      root,
      configFile: false,
      logLevel: 'silent',
      ...config,
      plugins: [gyral({ types: false, ...options })],
    },
    'serve',
  );
  const entries = resolved.optimizeDeps.entries;
  return {
    include: resolved.optimizeDeps.include ?? [],
    entries: entries === undefined ? undefined : [entries].flat(),
  };
}

it('pre-bundles those libraries in dev, with an optimize list of the app', async () => {
  const { include } = await optimizeDeps(libraryApp(), { optimize: ['left-pad'] });
  expect(include).toEqual([
    '@gyral/core',
    'design-system',
    'design-system/button',
    'test-widgets',
    'left-pad',
  ]);
});

it("scans the component modules on a custom server, and keeps Vite's HTML crawl elsewhere", async () => {
  const root = libraryApp();
  expect((await optimizeDeps(root, {}, { appType: 'custom' })).entries).toEqual([
    '**/*.html',
    'src/card.ts', // not src/util.ts, and never the server's modules
  ]);
  expect((await optimizeDeps(root)).entries).toBeUndefined();
  expect((await optimizeDeps(root, { optimize: 'auto' })).entries).toEqual([
    '**/*.html',
    'src/card.ts',
  ]);
});

it("keeps the app's own entries, and scans nothing with optimize: false", async () => {
  const root = libraryApp();
  const own: InlineConfig = { appType: 'custom', optimizeDeps: { entries: ['src/main.ts'] } };
  expect((await optimizeDeps(root, {}, own)).entries).toEqual(['src/main.ts']);
  expect(
    (await optimizeDeps(root, { optimize: false }, { appType: 'custom' })).entries,
  ).toBeUndefined();
});

it("adds a Vitest browser project's tests to the auto scan", async () => {
  const test = { include: ['test/browser/**/*.test.ts'], browser: { enabled: true } };
  const { entries } = await optimizeDeps(libraryApp(), { optimize: 'auto' }, { test });
  expect(entries).toEqual(['**/*.html', 'src/card.ts', 'test/browser/**/*.test.ts']);
});

it('keeps gyralVitePreset() as the spread-in spelling of gyral()', () => {
  const preset = gyralVitePreset({ optimize: ['a', 'b', 'a'] });
  expect(preset.optimizeDeps.include).toEqual(['a', 'b']);
  expect(preset.plugins.map((p) => p.name)).toEqual(gyral().map((p) => p.name));
});
