import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { checkSnippet } from '../../packages/mcp/src/check.ts';
import { migrateGyral } from '../lib/migrate-gyral.mjs';

describe('Gyral AST migration', () => {
  it('preserves generics, aliases, namespace calls, comments and native definitions', () => {
    const old = `import { define as component } from '@gyral/core';
import * as gy from '@gyral/core';
const A = component<State, Msg>('my-a', spec);
const B = gy.define('my-b', spec);
customElements.define('native-tag', Native);
function shadow(component) { return component('unchanged', spec); }
// component<State, Msg>('a-comment', spec)
const text = "component('a-string', spec)";
const C = component<State, Msg>()('already-new', spec);`;
    const result = migrateGyral(old);
    expect(result.edits).toBe(2);
    expect(result.code).toContain("component<State, Msg>()('my-a', spec)");
    expect(result.code).toContain("gy.define()('my-b', spec)");
    expect(result.code).toContain("customElements.define('native-tag', Native)");
    expect(result.code).toContain("return component('unchanged', spec)");
    expect(migrateGyral(result.code).edits).toBe(0);
  });

  it('migrates typed row intents and breaks the view inference cycle', () => {
    const result = migrateGyral(`import { define, intents as names, each, html } from '@gyral/core';
type Msg = { _tag: 'Pick' };
interface State { rows: readonly number[]; }
const i = names<Msg>();
const Row = (item: number) => html\`<li data-intent=\${i.Pick}>\${item}</li>\`;
const List = define<State, Msg>('my-list', {
  init: () => ({ rows: [1, 2] }), update: { Pick: s => s },
  intent: { Pick: true }, view: s => html\`<ul data-intent=\${i.Pick}>\${each(s.rows, n => n, Row)}\${each(s.rows, n => n, Row)}</ul>\`
});`);
    expect(result.warnings).toEqual([]);
    expect(result.code).toContain('intentsOf as names');
    expect(result.code).toContain('names<typeof List>()');
    expect(result.code).toContain('(item: number): GyralTemplateResult =>');
    expect(result.code).toContain('view: (s, i) =>');
    expect(migrateGyral(result.code).edits).toBe(0);
    expect(
      checkSnippet(result.code, resolve(import.meta.dirname, '../../packages/mcp')).report,
    ).toMatch(/^No type errors/);
  });

  it('keeps an import unchanged when aliases or indirect references need manual review', () => {
    const result = migrateGyral(`import { define, intents } from '@gyral/core';
type Msg = { _tag: 'Pick' };
const createNames = intents;
const i = intents<Msg>();
const A = define<S, Msg>('my-a', spec);`);
    expect(result.code).toContain('import { define, intents }');
    expect(result.code).toContain('intents<Msg>()');
    expect(result.warnings.join('\n')).toContain('used indirectly');
    expect(
      migrateGyral("import * as gy from '@gyral/core'; type M = gy.Messages<T>;").warnings.join(
        '\n',
      ),
    ).toContain('Messages');
  });

  it('does not guess ambiguous intent ownership or numeric clock semantics', () => {
    const result =
      migrateGyral(`import { define, intents, IntentName, Messages } from '@gyral/core';
import { periodic as ticks } from '@gyral/time';
type Msg = Real | IntentName<'Pick'>;
type Helpers = Messages<Msg>;
const i = intents<Msg>();
const A = define<S, Msg>('my-a', spec);
const B = define<S, Msg>('my-b', spec);
const clock = ticks(1000, n => ({ _tag: 'Tick', n }));`);
    expect(result.code).toContain('intents<Msg>()');
    expect(result.code).toContain('ticks(1000');
    expect(result.warnings.join('\n')).toContain('epoch milliseconds');
    expect(result.warnings.join('\n')).toContain('one local component');
    expect(result.warnings.join('\n')).toContain('IntentName');
    expect(result.warnings.join('\n')).toContain('Messages');
  });
});
