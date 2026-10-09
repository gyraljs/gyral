// Generated element typings (gyral-1zd.25): exported two-call define() components become
// HTMLElementTagNameMap entries; the file is rewritten only when it changes.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { componentsIn, tagMapSource, writeTagMap } from '../../src/compiler/tag-map.js';

describe('componentsIn', () => {
  it('finds two-call define() components, exported or not, with or without type arguments', () => {
    const code = [
      "export const Counter = define<State, Msg>()('app-counter', {",
      'export const Badge = define()("x-badge", {',
      'export const Table = define<Row, Map<string, Array<number>>, { a: () => void }>()(`my-table`, {',
      "const Hidden = define<S, M>()('not-exported', {",
      "customElements.define('plain-el', PlainEl);",
      "export const Old = define<S, M>('one-call', {",
    ].join('\n');
    expect(componentsIn(code, '/app/src/a.ts')).toEqual([
      { tag: 'app-counter', name: 'Counter', file: '/app/src/a.ts' },
      { tag: 'x-badge', name: 'Badge', file: '/app/src/a.ts' },
      { tag: 'my-table', name: 'Table', file: '/app/src/a.ts' },
      // Not exported: discovered (component loading needs it) but without a name (no typing).
      { tag: 'not-exported', name: undefined, file: '/app/src/a.ts' },
    ]);
  });
});

describe('tagMapSource', () => {
  it('imports each class relative to the output, with .js specifiers', () => {
    const text = tagMapSource(
      [{ tag: 'app-counter', name: 'Counter', file: '/app/src/ui/counter.ts' }],
      '/app/.gyral/elements.d.ts',
    );
    expect(text).toContain(
      '"app-counter": InstanceType<typeof import("../src/ui/counter.js").Counter>;',
    );
    expect(text).toContain('interface HTMLElementTagNameMap');
  });
});

describe('writeTagMap', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  });

  it('scans src (skipping tests), sorts by tag and writes only on change', () => {
    dir = mkdtempSync(join(tmpdir(), 'gyral-tags-'));
    mkdirSync(join(dir, 'src/nested'), { recursive: true });
    writeFileSync(join(dir, 'src/b.ts'), "export const B = define()('b-el', {});");
    writeFileSync(join(dir, 'src/nested/a.ts'), "export const A = define<S>()('a-el', {});");
    writeFileSync(join(dir, 'src/a.test.ts'), "export const T = define()('t-el', {});");
    const first = writeTagMap({ root: dir });
    expect(first.written).toBe(true);
    expect(first.entries.map((e) => e.tag)).toEqual(['a-el', 'b-el']);
    const text = readFileSync(join(dir, '.gyral/elements.d.ts'), 'utf8');
    expect(text).toContain('import("../src/nested/a.js").A');
    expect(writeTagMap({ root: dir }).written).toBe(false);
  });
});
