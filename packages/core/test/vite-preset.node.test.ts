import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig, type UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEMPLATE_SOURCES,
  GYRAL_PACKAGES,
  gyralDependents,
  gyralVitePreset,
} from '../src/vite.js';

const noExternal = async (
  command: 'build' | 'serve',
  extra: UserConfig = {},
): Promise<Record<string, unknown>> => {
  const config = await resolveConfig(
    { configFile: false, logLevel: 'silent', ...gyralVitePreset(), ...extra },
    command,
  );
  return Object.fromEntries(
    Object.entries(config.environments).map(([name, env]) => [name, env.resolve.noExternal]),
  );
};

describe('gyralVitePreset() (gyral-a7r)', () => {
  it('adds the template compiler, for `vite build` only (view/01-templates.md)', () => {
    const [compiler, locations, devServer, ...rest] = gyralVitePreset().plugins;
    expect(rest).toEqual([]);
    // Development source locations for runtime templates (view/01 "Source locations").
    expect(locations?.name).toBe('gyral:template-locations');
    expect(locations?.apply).toBe('serve');
    expect(locations?.enforce).toBe('pre');
    expect(devServer?.name).toBe('gyral:dev-server');
    expect(devServer?.apply).toBe('serve');
    expect(compiler?.name).toBe('gyral:template-compiler');
    expect(compiler?.apply).toBe('build');
    expect(compiler?.enforce).toBe('pre');
  });

  it("compiles @gyral/core's html by default (ADR 0018, Phase 3)", () => {
    expect(DEFAULT_TEMPLATE_SOURCES).toEqual(['@gyral/core']);
  });

  it('pre-bundles nothing by default, and extra modules without duplicates', () => {
    expect(gyralVitePreset().optimizeDeps.include).toEqual([]);
    expect(gyralVitePreset()).not.toHaveProperty('resolve'); // nothing to dedupe since Lit left
    const include = gyralVitePreset({ optimize: ['a', 'b', 'a'] }).optimizeDeps.include;
    expect(include).toEqual(['a', 'b']);
  });

  it("runs Gyral's packages through Vite in the dev server's SSR, not in builds (view/06)", async () => {
    const serve = await noExternal('serve');
    expect(serve['ssr']).toEqual([GYRAL_PACKAGES]);
    expect(serve['client']).toEqual([]);
    expect((await noExternal('build', { environments: { ssr: {} } }))['ssr']).toEqual([]);
    expect(GYRAL_PACKAGES.test('@gyral/core')).toBe(true);
    expect(GYRAL_PACKAGES.test('gyral-ish')).toBe(false);
  });

  it("keeps the app's own noExternal", async () => {
    expect((await noExternal('serve', { ssr: { noExternal: true } }))['ssr']).toBe(true);
    const own = await noExternal('serve', { ssr: { noExternal: ['mine'] } });
    expect(own['ssr']).toEqual(['mine', GYRAL_PACKAGES]);
  });
});

describe('gyralDependents()', () => {
  it("lists the app's dependencies that depend on a Gyral package", () => {
    const root = mkdtempSync(join(tmpdir(), 'gyral-dependents-'));
    const pkg = (dir: string, manifest: object): void => {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, 'package.json'), JSON.stringify(manifest));
    };
    try {
      pkg('.', {
        dependencies: { '@gyral/core': '*', ds: '*', plain: '*', missing: '*' },
        devDependencies: { kit: '*' },
      });
      pkg('node_modules/ds', { peerDependencies: { '@gyral/core': '*' } });
      pkg('node_modules/kit', { dependencies: { '@gyral/router': '*' } });
      pkg('node_modules/plain', { dependencies: { other: '*' } });
      expect(gyralDependents(root)).toEqual(['ds', 'kit']);
      expect(gyralDependents(join(root, 'nowhere'))).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
