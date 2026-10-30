/// <reference types="node" />
// gyral-w2j: a release's transforms rewrite the API of the release they migrate from (0.3.8's:
// 0.3.7's gyralVitePreset() into gyral(), which 0.3.0 doesn't export), so the codemod leaves, and
// reports once, a package whose @gyral/core is older than that: found from the module's nearest
// package.json, installed first, else declared. 0.3.7 and 0.3.8 are both rewritten.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { runCodemod } from '../src/index.js';
import { source } from './helpers.js';

const VITE_CONFIG = source`
  import { defineConfig } from 'vite';
  import { gyralVitePreset } from '@gyral/core/vite';

  export default defineConfig(gyralVitePreset());
`;
const UTIL = 'export const answer = 42;\n';

const manifest = (core?: string): string =>
  JSON.stringify({ name: 'app', dependencies: core === undefined ? {} : { '@gyral/core': core } });
const installed = (version: string): string => JSON.stringify({ name: '@gyral/core', version });

let dir = '';

async function write(files: Readonly<Record<string, string>>): Promise<void> {
  for (const [file, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await writeFile(join(dir, file), text);
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gyral-codemod-version-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** What a dry run changes, and its findings as `file [transform] reason`. */
async function dry(): Promise<{ changed: readonly string[]; findings: readonly string[] }> {
  const result = await runCodemod({ release: '0.3.8', cwd: dir, dry: true });
  if (!result.ok) throw new Error(result.error);
  const findings = result.findings.map((f) => `${f.file} [${f.transform}] ${f.reason}`);
  return { changed: result.changed, findings };
}

it('rewrites a package on 0.3.7 or 0.3.8, and leaves an older one, reported once', async () => {
  await write({
    'old/package.json': manifest('0.3.0'),
    'old/node_modules/@gyral/core/package.json': installed('0.3.0'),
    'old/vite.config.ts': VITE_CONFIG,
    'old/site/vite.config.ts': VITE_CONFIG,
    'old/src/util.ts': UTIL, // nothing to rewrite
    'from/package.json': manifest('0.3.7'),
    'from/node_modules/@gyral/core/package.json': installed('0.3.7'),
    'from/vite.config.ts': VITE_CONFIG,
    'new/package.json': manifest('0.3.8'),
    'new/node_modules/@gyral/core/package.json': installed('0.3.8'),
    'new/vite.config.ts': VITE_CONFIG,
    'quiet/package.json': manifest('0.3.0'),
    'quiet/src/util.ts': UTIL, // an old package with nothing to rewrite isn't reported
  });
  expect(await dry()).toEqual({
    changed: ['from/vite.config.ts', 'new/vite.config.ts'],
    findings: [
      "old/package.json [core-version] left as is: this package's @gyral/core is 0.3.0 " +
        '(installed), and the 0.3.8 rewrites start from 0.3.7: migrate it to 0.3.7 first ' +
        '(2 modules to rewrite)',
    ],
  });
});

it('reads the installed version first, then the declared one, and the lookup Node does', async () => {
  await write({
    // Declared ^0.3.0, installed 0.3.7: what runs is 0.3.7.
    'ranged/package.json': manifest('^0.3.0'),
    'ranged/node_modules/@gyral/core/package.json': installed('0.3.7'),
    'ranged/vite.config.ts': VITE_CONFIG,
    // Nothing installed yet: the lowest version the declared range allows.
    'fresh/package.json': manifest('~0.3.7'),
    'fresh/vite.config.ts': VITE_CONFIG,
    'stale/package.json': manifest('^0.3.0'),
    'stale/vite.config.ts': VITE_CONFIG,
    // A workspace package declaring nothing, with core installed (hoisted) at the root.
    'mono/package.json': manifest(),
    'mono/node_modules/@gyral/core/package.json': installed('0.3.6'),
    'mono/packages/site/package.json': manifest(),
    'mono/packages/site/vite.config.ts': VITE_CONFIG,
  });
  const { changed, findings } = await dry();
  expect(changed).toEqual(['fresh/vite.config.ts', 'ranged/vite.config.ts']);
  expect(findings).toEqual([
    "mono/packages/site/package.json [core-version] left as is: this package's @gyral/core is " +
      '0.3.6 (installed), and the 0.3.8 rewrites start from 0.3.7: migrate it to 0.3.7 first ' +
      '(1 module to rewrite)',
    "stale/package.json [core-version] left as is: this package's @gyral/core is ^0.3.0 " +
      '(declared, not installed), and the 0.3.8 rewrites start from 0.3.7: migrate it to 0.3.7 ' +
      'first (1 module to rewrite)',
  ]);
});

it('rewrites a module whose @gyral/core version is unknown, as before', async () => {
  await write({
    'loose/vite.config.ts': VITE_CONFIG,
    'tagged/package.json': manifest('latest'),
    'tagged/vite.config.ts': VITE_CONFIG,
  });
  expect((await dry()).changed).toEqual(['loose/vite.config.ts', 'tagged/vite.config.ts']);
});
