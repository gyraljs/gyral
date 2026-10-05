import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gyralVitePreset, LIT_PACKAGES, LIT_PREBUNDLE } from '../src/vite.js';

const SRC = join(import.meta.dirname, '../src');

/** Every `lit` / `lit/...` module imported anywhere in core's source. */
function litImports(): string[] {
  const found = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts')) {
        const text = readFileSync(path, 'utf8');
        for (const m of text.matchAll(/from '(lit(?:\/[^']+)?)'/g)) found.add(m[1] ?? '');
      }
    }
  };
  walk(SRC);
  return [...found].sort();
}

describe('gyralVitePreset() (gyral-a7r)', () => {
  it('dedupes every Lit package and pre-bundles Lit modules', () => {
    const preset = gyralVitePreset();
    expect(preset.resolve.dedupe).toEqual([...LIT_PACKAGES]);
    expect(preset.optimizeDeps.include).toEqual([...LIT_PREBUNDLE]);
  });

  it('adds extra modules without duplicates', () => {
    const include = gyralVitePreset({ optimize: ['lit', 'lit/directives/unsafe-html.js'] })
      .optimizeDeps.include;
    expect(include.filter((m) => m === 'lit')).toHaveLength(1);
    expect(include).toContain('lit/directives/unsafe-html.js');
  });

  it('pre-bundles every Lit module that core imports (keep LIT_PREBUNDLE in sync)', () => {
    const missing = litImports().filter((m) => !LIT_PREBUNDLE.includes(m));
    expect(missing).toEqual([]);
  });
});
