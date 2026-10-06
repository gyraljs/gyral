import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATE_SOURCES, gyralVitePreset } from '../src/vite.js';

describe('gyralVitePreset() (gyral-a7r)', () => {
  it('adds the template compiler, for `vite build` only (view/01-templates.md)', () => {
    const [compiler, ...rest] = gyralVitePreset().plugins;
    expect(rest).toEqual([]);
    expect(compiler?.name).toBe('gyral:template-compiler');
    expect(compiler?.apply).toBe('build');
    expect(compiler?.enforce).toBe('pre');
  });

  it("compiles @gyral/core's html by default (ADR 0018, Phase 3)", () => {
    expect(DEFAULT_TEMPLATE_SOURCES).toEqual(['@gyral/core']);
  });

  it('pre-bundles nothing by default, and extra modules without duplicates', () => {
    expect(gyralVitePreset().optimizeDeps.include).toEqual([]);
    expect(gyralVitePreset().resolve.dedupe).toEqual([]);
    const include = gyralVitePreset({ optimize: ['a', 'b', 'a'] }).optimizeDeps.include;
    expect(include).toEqual(['a', 'b']);
  });
});
