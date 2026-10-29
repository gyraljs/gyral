/// <reference types="node" />
// A rewritten module that passed the app's Prettier before is formatted with it after, under the
// app's config (gyral-337.16: gyral-shop's `format:check` failed after the codemod); any other
// rewritten module stays as written, and the report marks it.
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as prettier from 'prettier';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { formatReport } from '../src/report.js';
import { runCodemod, transformSource } from '../src/index.js';

const CONFIG = { singleQuote: true, printWidth: 60 };
const VITE_CONFIG = [
  "import { defineConfig } from 'vite';",
  "import { gyralVitePreset } from '@gyral/core/vite';",
  '',
  "export default defineConfig(gyralVitePreset({ types: false, optimize: 'auto' }));",
  '',
].join('\n');
const MAIN = [
  'import { defineDriver, provideDrivers } from "@gyral/core";',
  '',
  'const feed = defineDriver<void, string>("feed");',
  'provideDrivers(document.body, { feed: feed.provide(() => "hi") });',
  '',
].join('\n');

let dir = '';
const options = (file: string) => ({ ...CONFIG, filepath: join(dir, file) });
const read = (file: string): Promise<string> => readFile(join(dir, file), 'utf8');

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gyral-codemod-format-'));
  await mkdir(join(dir, 'node_modules'));
  await mkdir(join(dir, 'src'));
  const installed = dirname(createRequire(import.meta.url).resolve('prettier'));
  await symlink(installed, join(dir, 'node_modules/prettier'), 'dir');
  await writeFile(join(dir, '.prettierrc'), JSON.stringify(CONFIG));
  // vite.config.ts passes the app's Prettier; src/main.ts (double quotes) doesn't.
  await writeFile(
    join(dir, 'vite.config.ts'),
    await prettier.format(VITE_CONFIG, options('vite.config.ts')),
  );
  await writeFile(join(dir, 'src/main.ts'), MAIN);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

it("formats a module that passed the app's Prettier, and leaves one that didn't", async () => {
  const before = await read('vite.config.ts');
  const written = transformSource('0.3.8', before, 'vite.config.ts').after;
  expect(await prettier.check(written, options('vite.config.ts')), 'as written').toBe(false);

  const dry = await runCodemod({ release: '0.3.8', cwd: dir, dry: true });
  expect(dry).toMatchObject({ ok: true, unformatted: ['src/main.ts'] });
  expect(dry.ok && dry.diff).toContain('+export default defineConfig({\n');

  const result = await runCodemod({ release: '0.3.8', cwd: dir, force: true });
  expect(result).toMatchObject({
    ok: true,
    changed: ['src/main.ts', 'vite.config.ts'],
    unformatted: ['src/main.ts'],
  });
  const formatted = await read('vite.config.ts');
  expect(formatted).toBe(await prettier.format(written, options('vite.config.ts')));
  expect(formatted).toContain("plugins: [gyral({ types: false, optimize: 'auto' })],");
  expect(await read('src/main.ts')).toBe(transformSource('0.3.8', MAIN, 'src/main.ts').after);
  expect(result.ok && formatReport({ release: '0.3.8', dry: false, ...result })).toContain(
    [
      '  src/main.ts (not formatted)',
      '  vite.config.ts',
      'Run your formatter on the files marked "not formatted": the app has no Prettier, or they ' +
        "didn't pass it before the rewrite.",
    ].join('\n'),
  );
});

it("says so when every rewritten module is formatted with the app's Prettier", async () => {
  const result = await runCodemod({
    release: '0.3.8',
    cwd: dir,
    force: true,
    paths: ['vite.config.ts'],
  });
  expect(result).toMatchObject({ ok: true, changed: ['vite.config.ts'], unformatted: [] });
  expect(result.ok && formatReport({ release: '0.3.8', dry: false, ...result })).toBe(
    [
      '@gyral/codemod 0.3.8: changed 1 of 1 files',
      '  vite.config.ts',
      "Formatted with the app's Prettier.",
      'Nothing left to review.',
    ].join('\n'),
  );
});
