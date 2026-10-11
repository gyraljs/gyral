/// <reference types="node" />
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { manifest, parse, scaffold } from '../src/index.js';
import { invalidPackageName, toPackageName } from '../src/names.js';
import { detectPackageManager, nextSteps } from '../src/package-manager.js';
import { isEmptyDir } from '../src/scaffold.js';

describe('parse', () => {
  it('reads a directory, a template and --yes', () => {
    expect(parse(['my-app', '--template', 'ssr', '-y'])).toEqual({
      ok: true,
      options: { dir: 'my-app', template: 'ssr', yes: true, help: false, version: false },
    });
    expect(parse([])).toMatchObject({ ok: true, options: { dir: undefined, template: undefined } });
  });

  it('rejects unknown templates, unknown flags and extra directories', () => {
    expect(parse(['-t', 'react'])).toMatchObject({ ok: false, error: /unknown template "react"/ });
    expect(parse(['--typescript'])).toMatchObject({ ok: false });
    expect(parse(['a', 'b'])).toMatchObject({ ok: false, error: /one directory/ });
  });
});

describe('package names', () => {
  it('derives a valid name from the directory', () => {
    expect(toPackageName('My App!')).toBe('my-app');
    expect(toPackageName('/tmp/projects/shop/')).toBe('shop');
    expect(toPackageName('...')).toBe('gyral-app');
    expect(invalidPackageName(toPackageName('Ünïcode Ñame'))).toBeUndefined();
  });

  it('explains invalid names', () => {
    expect(invalidPackageName('my-app')).toBeUndefined();
    expect(invalidPackageName('@scope/app')).toBeUndefined();
    expect(invalidPackageName('MyApp')).toMatch(/lowercase/);
    expect(invalidPackageName('.hidden')).toMatch(/start with/);
    expect(invalidPackageName('a b')).toMatch(/only lowercase/);
    expect(invalidPackageName('node_modules')).toMatch(/reserved/);
    expect(invalidPackageName('x'.repeat(215))).toMatch(/214/);
  });
});

describe('package manager', () => {
  it('detects the one that ran us', () => {
    expect(detectPackageManager('pnpm/10.33.2 npm/? node/v24.15.0 linux x64')).toBe('pnpm');
    expect(detectPackageManager('yarn/4.9.0 npm/? node/v24.15.0')).toBe('yarn');
    expect(detectPackageManager('npm/11.12.1 node/v24.15.0')).toBe('npm');
    expect(detectPackageManager(undefined)).toBe('npm');
  });

  it('prints its commands', () => {
    expect(nextSteps('npm', 'my-app', true)).toEqual([
      'cd my-app',
      'npm install',
      'npx playwright install chromium   # once, for the tests',
      'npm run dev',
    ]);
    expect(nextSteps('pnpm', '.', false)).toEqual(['pnpm install', 'pnpm dev']);
    expect(nextSteps('yarn', 'my app', false)[0]).toBe('cd "my app"');
  });
});

describe('scaffold', () => {
  let dir = '';
  afterEach(async () => {
    if (dir !== '') await rm(dir, { recursive: true, force: true });
  });

  it.each(['basic', 'ssr'] as const)('writes the %s template', async (template) => {
    dir = await mkdtemp(join(tmpdir(), 'create-gyral-'));
    const target = join(dir, 'app');
    await scaffold({ targetDir: target, template, packageName: 'app', gyralVersion: '0.1.0' });
    const files = await readdir(target, { recursive: true });
    expect(files).toContain('.gitignore');
    expect(files).not.toContain('_gitignore');
    expect(files).toContain('tsconfig.json');
    // Agent instructions: AGENTS.md for every agent, CLAUDE.md importing it for Claude Code.
    const agents = await readFile(join(target, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('https://gyral.dev/llms.txt');
    expect(agents).toContain('/plugin install gyral@gyral');
    expect(agents.split('\n').length).toBeLessThanOrEqual(80);
    expect(await readFile(join(target, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n');
    const pkg = JSON.parse(await readFile(join(target, 'package.json'), 'utf8')) as unknown;
    expect(pkg).toEqual(manifest(template, 'app', '0.1.0'));
    expect(manifest(template, 'app', '0.1.0').dependencies['@gyral/core']).toBe('^0.1.0');
    // No Lit since the view layer (ADR 0018): no lit dependency, no lit-html pin.
    const deps = JSON.stringify(manifest(template, 'app', '0.1.0'));
    expect(deps).not.toMatch(/lit/);
  });

  it('refuses a directory with files in it', async () => {
    dir = await mkdtemp(join(tmpdir(), 'create-gyral-'));
    expect(await isEmptyDir(dir)).toBe(true);
    expect(await isEmptyDir(join(dir, 'missing'))).toBe(true);
    await writeFile(join(dir, 'notes.txt'), 'mine');
    expect(await isEmptyDir(dir)).toBe(false);
    await expect(
      scaffold({ targetDir: dir, template: 'basic', packageName: 'x', gyralVersion: '0.1.0' }),
    ).rejects.toThrow(/not empty/);
    expect(await readdir(dir)).toEqual(['notes.txt']);
  });
});
