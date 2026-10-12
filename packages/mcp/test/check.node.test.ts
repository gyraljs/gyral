// check_snippet: type errors with positions, and a suggested fix for each recognized TypeScript
// error and common Gyral mistake.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkSnippet } from '../src/check.js';
import { lintGyral } from '../src/diagnose.js';
import { explainTs } from '../src/explain-ts.js';
import { blankComments, propertyValues } from '../src/source-scan.js';

const pkgDir = fileURLToPath(new URL('..', import.meta.url));

describe('check_snippet', () => {
  it('reports type errors with positions', () => {
    const result = checkSnippet("import { define } from '@gyral/core';\ndefine(42);\n", pkgDir);
    expect(result.ran).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.report).toMatch(/2:\d+ TS\d+/);
  }, 30_000);

  it('suggests fixes for TypeScript errors in Gyral terms', () => {
    const result = checkSnippet(
      "import { define, html } from '@gyral/core';\nexport const X = define<{ readonly n: number }, never>('x-y', { init: () => ({ n: 0 }), view: (s) => html`${s.n}` });\n",
      pkgDir,
    );
    expect(result.ok).toBe(false);
    expect(result.suggestions.map((s) => s.rule)).toContain('single-call-define');
    expect(result.report).toContain('Suggested fixes:');
    expect(result.report).toContain('call check_snippet again');
  }, 30_000);

  it('suggests a TemplateResult return type for a row that names intents', () => {
    const code = `import { define, each, html, intentsOf } from '@gyral/core';
interface Todo { readonly id: string; readonly text: string }
type Msg = { readonly _tag: 'Remove'; readonly id: string };
const i = intentsOf<typeof Todos>();
const row = (t: Todo) => html\`<li>\${t.text}<button value=\${t.id} data-intent=\${i.Remove}>x</button></li>\`;
export const Todos = define<{ readonly todos: readonly Todo[] }, Msg>()('my-todos', {
  init: () => ({ todos: [] }),
  intent: { Remove: ({ value }) => ({ _tag: 'Remove', id: value ?? '' }) },
  update: { Remove: (s, m) => ({ todos: s.todos.filter((t) => t.id !== m.id) }) },
  view: (s) => html\`<ul>\${each(s.todos, (t) => t.id, row)}</ul>\`,
});
`;
    const result = checkSnippet(code, pkgDir);
    expect(result.suggestions.map((s) => s.rule)).toContain('row-return-type');
    expect(result.report).toContain('TemplateResult');
  }, 30_000);

  it('finds Gyral mistakes TypeScript accepts', () => {
    const code = `import { command, define, html } from '@gyral/core';
import { listen } from '@gyral/router';
import { periodic } from '@gyral/time';
// fetch() in a comment is fine
export const X = define<{ readonly n: number; readonly at: number }, { readonly _tag: 'Tick' }>()('x-y', {
  init: () => [{ n: 0, at: Date.now() }, [listen((l) => ({ _tag: 'Tick' }))]],
  intent: {},
  update: {
    Tick: (s) => {
      s.n++;
      return { ...s, at: Date.now() };
    },
  },
  view: (s, i) => html\`<button @click=\${() => fetch('/x')} .value=\${s.n} disabled=\${s.n > 1}>go</button>\`,
});
`;
    const rules = lintGyral(code).map((s) => `${s.rule}@${String(s.line)}`);
    expect(rules).toEqual(
      expect.arrayContaining([
        'periodic@3',
        'long-lived-work-in-init@6',
        'side-effect-in-model@6',
        'state-mutation@10',
        'side-effect-in-model@11',
        'closure-in-view@14',
        'property-binding@14',
        'boolean-attribute@14',
      ]),
    );
    expect(rules.some((r) => r.endsWith('@4'))).toBe(false);
    expect(lintGyral('const s = { stores: 1 };\nctx.read(cart);').map((s) => s.rule)).toEqual([]);
    expect(lintGyral('view: (s, { read }) => ctx.read(cart)').map((s) => s.code)).toContain(
      'G0050',
    );
    // Assembled, so the clean-room provenance check doesn't read it as an import.
    const renderer = ['l', 'it'].join('');
    expect(lintGyral(`import { html } from '${renderer}';`).map((s) => s.rule)).toEqual([
      'lit-import',
    ]);
    expect(lintGyral('init: () => [],').map((s) => s.rule)).toEqual(['array-state']);
    expect(
      lintGyral('subscriptions: (s) => [command(feed, { at: Date.now() })],').map((s) => s.code),
    ).toEqual(['G0080']);
  });

  it('hints, without failing, when native constraints would hide custom errors', () => {
    const hints = lintGyral(
      'html`<form data-intent=${i.Submit}><input required ${invalid(e)} /></form>`; IntentRejected',
    );
    expect(hints).toMatchObject([
      { rule: 'native-validation-blocks-custom-errors', severity: 'hint' },
    ]);
    expect(
      lintGyral(
        'html`<form novalidate data-intent=${i.Submit}><input required ${invalid(e)} /></form>`',
      ),
    ).toEqual([]);
  });

  it('names only G-codes Gyral has, and maps known TypeScript errors', () => {
    const errors = JSON.parse(
      readFileSync(join(pkgDir, '..', 'core', 'src', 'errors.json'), 'utf8'),
    ) as readonly { readonly code: string }[];
    const codes = new Set(errors.map((e) => e.code));
    const source = readFileSync(join(pkgDir, 'src', 'diagnose.ts'), 'utf8');
    for (const [code] of source.matchAll(/G\d{4}/g)) expect(codes, code).toContain(code);
    expect(explainTs({ code: 7022, message: "'i' implicitly has type 'any'" })?.rule).toBe(
      'row-return-type',
    );
    expect(
      explainTs({
        code: 2305,
        message: "Module '\"@gyral/time\"' has no exported member 'periodic'.",
      })?.fix,
    ).toContain('every(ms');
    expect(
      explainTs({
        code: 2307,
        message: "Cannot find module '@gyral/testing' or its corresponding type declarations.",
      })?.fix,
    ).toContain('npm i -D @gyral/testing');
    expect(
      explainTs({ code: 2322, message: 'Type number is not assignable to type string.' }),
    ).toBeUndefined();
  });

  it('blanks comments but keeps strings, templates and their holes', () => {
    const code = "const a = 'x // y'; // gone\n/* gone\ntoo */ const t = `a ${ b /* c */ } // d`;";
    const clean = blankComments(code);
    expect(clean).toHaveLength(code.length);
    expect(clean.split('\n')).toHaveLength(3);
    expect(clean).toContain("'x // y'");
    expect(clean).not.toContain('gone');
    expect(clean).toContain('`a ${ b         } // d`');
    expect(propertyValues('{ init: () => ({ a: [1, 2] }), view: x }', 'init')[0]?.text).toBe(
      ' () => ({ a: [1, 2] })',
    );
  });

  it('explains when it cannot run', () => {
    const result = checkSnippet('const x = 1;', join(pkgDir, 'no-such-dir'));
    expect(result).toMatchObject({ ran: false, ok: false });
    expect(result.report).toContain('No package.json');
  });
});
