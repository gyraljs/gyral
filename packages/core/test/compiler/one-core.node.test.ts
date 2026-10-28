// One copy of core per app (gyral-k97.2, src/compiler/one-core.ts): the preset pre-bundles
// Gyral's installed browser entry points in dev, so Vite doesn't bundle a second copy of core
// for a package it meets partway through a run, and warns when @gyral/core is installed twice.
import { realpathSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { resolveConfig, type Logger } from 'vite';
import { afterEach, expect, it } from 'vitest';
import { browserEntries, coreCopies } from '../../src/compiler/one-core.js';
import { gyralVitePreset } from '../../src/vite.js';
import { app, buildApp } from './fixture.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A package.json; `subpaths` become its exports map. */
const pkg = (name: string, version: string, fields: object = {}, subpaths?: string[]): string =>
  JSON.stringify({
    name,
    version,
    type: 'module',
    ...(subpaths === undefined
      ? {}
      : { exports: Object.fromEntries(subpaths.map((s) => [s, `${s}/index.js`])) }),
    ...fields,
  });

const fixture = (files: Readonly<Record<string, string>>): string => {
  const root = app(files);
  roots.push(root);
  return root;
};

/** An app with Gyral's packages installed: some current, one older, one linked from source. */
function installedApp(): string {
  const root = fixture({
    'package.json': pkg('app', '1.0.0', {
      dependencies: { '@gyral/core': '0.3.7', '@gyral/http': '0.3.5', '@gyral/router': 'link:' },
      devDependencies: { '@gyral/ssr': '0.3.7', '@gyral/testing': '0.3.7' },
    }),
    'node_modules/@gyral/core/package.json': pkg('@gyral/core', '0.3.7', {}, [
      '.',
      './internal/server',
      './internal',
      './vite',
      './compiled',
      './eslint',
      './errors.json',
      './storage',
      './indexeddb',
    ]),
    // An older @gyral/http, before ./websocket existed.
    'node_modules/@gyral/http/package.json': pkg('@gyral/http', '0.3.5', {}, [
      '.',
      './testing',
      './sse',
    ]),
    'node_modules/@gyral/ssr/package.json': pkg('@gyral/ssr', '0.3.7', {}, [
      '.',
      './static',
      './node',
    ]),
    'node_modules/@gyral/testing/package.json': pkg('@gyral/testing', '0.3.7', {}, [
      '.',
      './vitest',
    ]),
    'checkout/router/package.json': pkg('@gyral/router', '0.3.7', {}, ['.']),
  });
  symlinkSync(join(root, 'checkout/router'), join(root, 'node_modules/@gyral/router'));
  return root;
}

it("lists the browser entry points of Gyral's installed packages, in each one's exports", () => {
  expect(browserEntries(installedApp())).toEqual([
    '@gyral/core',
    '@gyral/core/compiled',
    '@gyral/core/internal',
    '@gyral/core/storage',
    '@gyral/core/indexeddb',
    '@gyral/http',
    '@gyral/http/testing',
    '@gyral/http/sse',
    '@gyral/testing',
  ]);
});

it('lists none for an app without Gyral installed', () => {
  expect(browserEntries(fixture({ 'package.json': pkg('app', '1.0.0') }))).toEqual([]);
});

/** `optimizeDeps.include` as Vite resolves it, for `command`, with the preset and `extra`. */
async function included(
  root: string,
  command: 'serve' | 'build',
  extra: { optimize?: string[]; exclude?: string[] } = {},
): Promise<readonly string[]> {
  const preset = gyralVitePreset({ types: false, optimize: extra.optimize ?? [] });
  const config = await resolveConfig(
    {
      root,
      configFile: false,
      logLevel: 'silent',
      ...preset,
      optimizeDeps: { ...preset.optimizeDeps, exclude: extra.exclude ?? [] },
    },
    command,
  );
  return config.optimizeDeps.include ?? [];
}

it("pre-bundles them in dev with the app's own optimize list, and not in builds", async () => {
  const root = installedApp();
  const dev = await included(root, 'serve', { optimize: ['some-lib', '@gyral/core'] });
  expect([...dev].sort()).toEqual(
    [...browserEntries(root), 'some-lib'].sort(), // listed once
  );
  expect(await included(root, 'build', { optimize: ['some-lib'] })).toEqual(['some-lib']);
});

it("leaves out a package the app's config excludes from pre-bundling", async () => {
  const dev = await included(installedApp(), 'serve', { exclude: ['@gyral/core'] });
  expect(dev.filter((entry) => entry.startsWith('@gyral/core'))).toEqual([]);
  expect(dev).toContain('@gyral/http');
});

/** An app on core 0.3.7 with a library that installed its own 0.3.1, two levels down. */
const TWO_COPIES = {
  'package.json': pkg('app', '1.0.0', {
    dependencies: { '@gyral/core': '0.3.7', 'design-system': '1.0.0', widgets: '2.0.0' },
    devDependencies: { tool: '1.0.0' },
  }),
  'main.ts': 'export const answer = 42;\n',
  'node_modules/@gyral/core/package.json': pkg('@gyral/core', '0.3.7'),
  'node_modules/design-system/package.json': pkg('design-system', '1.0.0', {
    peerDependencies: { '@gyral/core': '^0.3.0' },
  }),
  'node_modules/tool/package.json': pkg('tool', '1.0.0', { dependencies: { widgets: '1.0.0' } }),
  'node_modules/tool/node_modules/widgets/package.json': pkg('widgets', '1.0.0', {
    dependencies: { '@gyral/core': '0.3.1' },
  }),
  'node_modules/tool/node_modules/widgets/node_modules/@gyral/core/package.json': pkg(
    '@gyral/core',
    '0.3.1',
  ),
  'node_modules/widgets/package.json': pkg('widgets', '2.0.0', {
    dependencies: { '@gyral/core': '^0.3.7' },
  }),
};

it('finds each folder @gyral/core resolves to, and the packages that use it', () => {
  const root = realpathSync(fixture(TWO_COPIES));
  expect(coreCopies(root)).toEqual([
    {
      dir: join(root, 'node_modules/@gyral/core'),
      version: '0.3.7',
      users: ['app@1.0.0', 'design-system@1.0.0', 'widgets@2.0.0'],
    },
    {
      dir: join(root, 'node_modules/tool/node_modules/widgets/node_modules/@gyral/core'),
      version: '0.3.1',
      users: ['widgets@1.0.0'],
    },
  ]);
});

it('finds one copy when every package shares it', () => {
  const root = fixture({
    ...TWO_COPIES,
    'node_modules/tool/package.json': pkg('tool', '1.0.0'),
  });
  expect(coreCopies(root)).toHaveLength(1);
});

it('warns in a build when core is installed more than once, naming both copies and the fix', async () => {
  const built = await buildApp(TWO_COPIES);
  const warnings = built.logs.filter((log) => log.includes('G0015'));
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toMatch(/@gyral\/core is installed more than once/);
  expect(warnings[0]).toContain(
    '0.3.7 at node_modules/@gyral/core (app@1.0.0, design-system@1.0.0, widgets@2.0.0)',
  );
  expect(warnings[0]).toContain(
    '0.3.1 at node_modules/tool/node_modules/widgets/node_modules/@gyral/core (widgets@1.0.0)',
  );
  expect(warnings[0]).toContain('overrides');
  expect(warnings[0]).toContain('https://gyral.dev/errors/#G0015');
}, 30_000);

it('warns once per app, in dev too, however many configs resolve', async () => {
  const root = fixture(TWO_COPIES);
  const warnings: string[] = [];
  const logger: Logger = {
    info: () => undefined,
    warn: (msg) => warnings.push(msg),
    warnOnce: (msg) => warnings.push(msg),
    error: () => undefined,
    clearScreen: () => undefined,
    hasErrorLogged: () => false,
    hasWarned: false,
  };
  for (let run = 0; run < 2; run++) {
    await resolveConfig(
      { root, configFile: false, customLogger: logger, ...gyralVitePreset({ types: false }) },
      'serve',
    );
  }
  expect(warnings.filter((w) => w.includes('G0015'))).toHaveLength(1);
});

it('says nothing when the app has one copy', async () => {
  const built = await buildApp({
    ...TWO_COPIES,
    'node_modules/tool/package.json': pkg('tool', '1.0.0'),
  });
  expect(built.logs.filter((log) => log.includes('G0015'))).toEqual([]);
}, 30_000);
