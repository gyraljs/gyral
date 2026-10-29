/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse, usage } from '../src/args.js';
import { releases, runCodemod } from '../src/index.js';
import { source } from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, '../src/cli.ts');
const LOADER = pathToFileURL(join(here, '../../../scripts/lib/load-ts.mjs')).href;

const VITE_CONFIG = source`
  import { defineConfig } from 'vite';
  import { gyralVitePreset } from '@gyral/core/vite';

  export default defineConfig(gyralVitePreset());
`;
const MAIN = source`
  import { defineDriver, provideDrivers } from '@gyral/core';

  const feed = defineDriver<void, string>('feed');
  provideDrivers(document.body, { feed: feed.provide(() => 'hi') });
`;
const AFTER_MAIN = MAIN.replace("{ feed: feed.provide(() => 'hi') }", "[feed.provide(() => 'hi')]");

/** Files of a small app: two to rewrite, and copies where the walk must not go. */
const APP: Readonly<Record<string, string>> = {
  'vite.config.ts': VITE_CONFIG,
  'src/main.ts': MAIN,
  'src/feed.test.ts': MAIN,
  'src/types.d.ts': MAIN,
  'src/notes.md': MAIN,
  'node_modules/lib/index.ts': MAIN,
  'dist/main.js': MAIN,
  '.cache/main.ts': MAIN,
};

let dir = '';

async function writeApp(): Promise<void> {
  for (const [file, text] of Object.entries(APP)) {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await writeFile(join(dir, file), text);
  }
}

function git(...args: string[]): string {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: dir, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

function cli(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, ['--import', LOADER, CLI, ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
}

const read = (file: string): Promise<string> => readFile(join(dir, file), 'utf8');

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gyral-codemod-'));
  await writeApp();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('arguments', () => {
  it('needs a known release, and defaults paths to .', () => {
    expect(releases).toEqual(['0.3.8']);
    expect(parse(['0.3.8'])).toEqual({
      ok: true,
      options: {
        release: '0.3.8',
        paths: ['.'],
        dry: false,
        force: false,
        help: false,
        version: false,
      },
    });
    expect(parse(['0.3.8', 'src', 'vite.config.ts', '--dry', '--force'])).toMatchObject({
      ok: true,
      options: { paths: ['src', 'vite.config.ts'], dry: true, force: true },
    });
    expect(parse([])).toMatchObject({ ok: false, error: 'name a release: 0.3.8' });
    expect(parse(['0.2.0'])).toMatchObject({
      ok: false,
      error: /no transforms for release "0.2.0"/,
    });
    expect(parse(['0.3.8', '--write'])).toMatchObject({ ok: false });
    expect(parse(['--help'])).toMatchObject({ ok: true, options: { help: true } });
  });

  it('prints its version and its usage', async () => {
    const manifest = JSON.parse(await readFile(join(here, '../package.json'), 'utf8')) as {
      version: string;
    };
    expect(cli('--version')).toMatchObject({ status: 0, stdout: `${manifest.version}\n` });
    expect(cli('--help')).toMatchObject({ status: 0, stdout: `${usage()}\n` });
    expect(cli()).toMatchObject({
      status: 1,
      stderr: `gyral-codemod: name a release: 0.3.8\n\n${usage()}\n`,
    });
  });

  it('lists each release’s transforms in the usage', () => {
    expect(usage()).toContain('outside node_modules, dist, build, out, coverage and dot folders.');
    expect(usage()).toContain('Usage: npx @gyral/codemod <release> [paths…] [options]');
    expect(usage()).toMatch(/0\.3\.8 {2}gyralVitePreset\(options\) → gyral\(options\)/);
    expect(usage()).toContain('--dry          print a unified diff and write nothing');
  });
});

describe('a run over a clean git repository', () => {
  beforeEach(() => {
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'app');
  });

  it('rewrites the modules under the paths, skips the rest, and a second run changes nothing', async () => {
    const result = await runCodemod({ release: '0.3.8', cwd: dir });
    expect(result).toMatchObject({
      ok: true,
      files: 3,
      changed: ['src/main.ts', 'vite.config.ts'],
    });
    expect(await read('src/main.ts')).toBe(AFTER_MAIN);
    expect(await read('vite.config.ts')).toContain('defineConfig({ plugins: [gyral()] })');
    for (const file of [
      'src/feed.test.ts',
      'src/types.d.ts',
      'node_modules/lib/index.ts',
      'dist/main.js',
      '.cache/main.ts',
    ]) {
      expect(await read(file), file).toBe(APP[file]);
    }
    expect(result.ok && result.findings.map((f) => `${f.file}:${String(f.line)}`)).toEqual([
      'src/feed.test.ts:4',
    ]);

    git('commit', '-q', '-am', 'codemod');
    const again = await runCodemod({ release: '0.3.8', cwd: dir });
    expect(again).toMatchObject({ ok: true, changed: [] });
    expect(git('status', '--porcelain')).toBe('');
  });

  it('--dry prints a unified diff and writes nothing', () => {
    const { status, stdout } = cli('0.3.8', '--dry');
    expect(status).toBe(0);
    expect(stdout).toContain('--- a/src/main.ts\n+++ b/src/main.ts\n@@ ');
    expect(stdout).toContain("-provideDrivers(document.body, { feed: feed.provide(() => 'hi') });");
    expect(stdout).toContain("+provideDrivers(document.body, [feed.provide(() => 'hi')]);");
    expect(stdout).toContain('+++ b/vite.config.ts');
    expect(stdout).toContain(
      '@gyral/codemod 0.3.8 (dry run: nothing written): would change 2 of 3 files',
    );
    expect(stdout).toContain(
      'src/feed.test.ts:4 [driver-list] a driver record left as is: test file (records stay idiomatic for fakes)',
    );
    expect(git('status', '--porcelain')).toBe('');
  });

  it('the CLI writes, reports and exits 0', async () => {
    const { status, stdout } = cli('0.3.8', 'src');
    expect(status).toBe(0);
    expect(stdout).toBe(
      [
        '@gyral/codemod 0.3.8: changed 1 of 2 files',
        '  src/main.ts (not formatted)',
        'Run your formatter on the files marked "not formatted": the app has no Prettier, or they didn\'t pass it before the rewrite.',
        'Left as is, to review by hand (1):',
        '  src/feed.test.ts:4 [driver-list] a driver record left as is: test file (records stay idiomatic for fakes)',
        '',
      ].join('\n'),
    );
    expect(await read('src/main.ts')).toBe(AFTER_MAIN);
    expect(await read('vite.config.ts')).toBe(VITE_CONFIG);
  });

  it('refuses a working tree with uncommitted changes, unless --force', async () => {
    await writeFile(join(dir, 'src/new.ts'), 'export {};\n');
    const refused = cli('0.3.8');
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('gyral-codemod: refusing to write: ');
    expect(refused.stderr).toContain('has uncommitted changes:\n  ?? src/new.ts\n');
    expect(refused.stderr).toContain('Pass --force to write anyway, or --dry to see the diff.');
    expect(await read('src/main.ts')).toBe(MAIN);

    expect(cli('0.3.8', '--dry').status).toBe(0);
    expect(await read('src/main.ts')).toBe(MAIN);

    expect(cli('0.3.8', '--force').status).toBe(0);
    expect(await read('src/main.ts')).toBe(AFTER_MAIN);
  });
});

describe('outside a git repository', () => {
  it('refuses unless --force', async () => {
    const refused = await runCodemod({ release: '0.3.8', cwd: dir });
    expect(refused).toMatchObject({ ok: false, error: /\. is not in a git repository/ });
    expect(await read('src/main.ts')).toBe(MAIN);
    const forced = await runCodemod({ release: '0.3.8', cwd: dir, force: true });
    expect(forced).toMatchObject({ ok: true, changed: ['src/main.ts', 'vite.config.ts'] });
  });

  it('names a missing path or an unknown release', async () => {
    expect(await runCodemod({ release: '0.3.8', cwd: dir, paths: ['nope'], force: true })).toEqual({
      ok: false,
      error: 'no such file or directory: nope',
    });
    expect(await runCodemod({ release: '9.9.9', cwd: dir })).toMatchObject({ ok: false });
    const { status, stderr } = cli('9.9.9');
    expect(status).toBe(1);
    expect(stderr).toContain('gyral-codemod: no transforms for release "9.9.9" (known: 0.3.8)');
  });

  it('reports a module that does not parse, and keeps going', async () => {
    await writeFile(join(dir, 'src/broken.ts'), 'export const = ;\n');
    const result = await runCodemod({ release: '0.3.8', cwd: dir, force: true, paths: ['src'] });
    expect(result).toMatchObject({ ok: true, changed: ['src/main.ts'] });
    expect(result.ok && result.findings[0]).toMatchObject({
      file: 'src/broken.ts',
      transform: 'parse',
      reason: expect.stringMatching(/^left as is: it doesn't parse/) as unknown,
    });
  });
});
