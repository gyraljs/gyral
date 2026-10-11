import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The History API path is loaded with import() only where the Navigation API is missing. A
// runtime import in it puts the imported modules in both the eager graph and the lazy chunk,
// and the bundler then splits them into extra chunks that every page loads. Pass what it needs
// in from driver.ts instead.
describe('internal/history.ts', () => {
  it('has no runtime imports (type-only imports are erased)', () => {
    const source = readFileSync(new URL('../src/internal/history.ts', import.meta.url), 'utf8');
    const runtime = source.split('\n').filter((line) => /^\s*import\s+(?!type\s)/.test(line));
    expect(runtime).toEqual([]);
  });
});
