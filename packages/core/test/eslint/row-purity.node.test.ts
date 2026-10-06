// gyral/each-row-purity (@gyral/core/eslint; view/03-lists.md "Rows must be pure", "Keys";
// rules 8 and 9 of view/09-template-rules.md): an each() row reads only its parameters, its own
// locals, module-level bindings, imports and globals, and every each() has a key function.
import type { RuleTester } from 'eslint';
import { describe } from 'vitest';
import { rowPurityRule } from '../../src/eslint/index.js';
import { spanOf, tester, tsTester } from './helpers.js';

const IMPORT = "import { each, html } from '@gyral/core';\n";

const reads = (name: string): string =>
  `\`row\` reads \`${name}\`; return it from \`pick\` and take it as the second argument (view/03-lists.md).`;

const KEY =
  'each() needs a key function as its second argument: each(items, (x) => x.id, Row) ' +
  '(docs/design-docs/view/03-lists.md "Keys", rule 9).';

/** An invalid case with one error per read `[name, at, n]`, at the `n`th `at` (default 0). */
function impure(
  body: string,
  ...expected: [name: string, at: string, n?: number][]
): RuleTester.InvalidTestCase {
  const code = `${IMPORT}${body}\n`;
  return {
    code,
    errors: expected.map(([name, at, n]) => ({ message: reads(name), ...spanOf(code, at, n) })),
  };
}

describe('gyral/each-row-purity', () => {
  tester.run('gyral/each-row-purity', rowPurityRule, {
    valid: [
      // Parameters, the picked value, imports, module-level bindings and globals.
      `${IMPORT}const SUFFIX = '!';
export const view = (s) => html\`<ul>\${each(s.rows, (r) => r.id, (r, selected) =>
  html\`<li class=\${selected ? 'on' : ''}>\${r.label}\${SUFFIX}\${Math.round(r.n)}\${html}</li>\`,
  (r) => r.id === s.selected)}</ul>\`;`,
      // A module-level row, and a row declared in the view that reads only its parameters.
      `${IMPORT}const Row = (r) => html\`<li>\${r.label}</li>\`;
function Item(r) { return html\`<li>\${r.label}</li>\`; }
export const view = (s) => {
  const Local = (r, picked) => html\`<li>\${r.label}\${picked}</li>\`;
  return html\`\${each(s.rows, (r) => r.id, Row)}\${each(s.rows, (r) => r.id, Item)}
    \${each(s.rows, (r) => r.id, Local, (r) => r.id === s.selected)}\`;
};`,
      // The row's own locals and nested functions over them; a helper beside the row that is
      // itself pure; recursion through the row's own name.
      `${IMPORT}export const view = (s) => {
  const Cell = (v) => html\`<td>\${v}</td>\`;
  const Tree = (n) => html\`<li>\${n.label}<ul>\${each(n.kids, (k) => k.id, Tree)}</ul></li>\`;
  return html\`\${each(s.rows, (r) => r.id, (r) => {
    const cells = r.cells.map((c) => Cell(c));
    return html\`<tr>\${cells}</tr>\`;
  })}\${each(s.tree, (n) => n.id, Tree)}\`;
};`,
      // Not Gyral's each.
      'const each = (a, k, f) => a.map(f);\nexport const v = (s) => each(s.rows, (r) => r.id, (r) => s.x + r);',
    ],
    invalid: [
      // The spec's example: the view's state read inside an inline row.
      impure(
        'export const view = (s) => html`${each(s.rows, (r) => r.id, (r) => html`<li class=${r.id === s.selected ? "on" : ""}>${r.label}</li>`)}`;',
        ['s.selected', 's.selected'],
      ),
      // A row bound to a const in the view, reading intents and a local.
      impure(
        `export const view = (s, i) => {
  const label = s.prefix;
  const Row = (r) => html\`<li data-intent=\${i.Select}>\${label}\${r.label}</li>\`;
  return html\`<ul>\${each(s.rows, (r) => r.id, Row)}</ul>\`;
};`,
        ['i.Select', 'i.Select'],
        ['label', 'label', 1],
      ),
      // A function declaration in the view, and a nested function inside an inline row.
      impure(
        `export function view(s) {
  function Row(r) { return html\`<li>\${r.tags.map((t) => t === s.tag.name)}</li>\`; }
  return html\`\${each(s.rows, (r) => r.id, Row)}\${each(s.rows, (r) => r.id, (r) => () => s.count)}\`;
}`,
        ['s.tag.name', 's.tag.name'],
        ['s.count', 's.count'],
      ),
      // A helper beside the row that reads the view's state.
      impure(
        `export const view = (s) => {
  const Cell = (v) => html\`<td>\${v}\${s.unit}</td>\`;
  return html\`\${each(s.rows, (r) => r.id, (r) => Cell(r.v))}\`;
};`,
        ['Cell', 'Cell', 1],
      ),
      // A namespace import.
      {
        code: "import * as g from '@gyral/core';\nexport const v = (s) => g.each(s.rows, (r) => r.id, (r) => s.x);\n",
        errors: [
          {
            message: reads('s.x'),
            ...spanOf(
              "import * as g from '@gyral/core';\nexport const v = (s) => g.each(s.rows, (r) => r.id, (r) => s.x);\n",
              's.x',
            ),
          },
        ],
      },
      // Rule 9: no key function.
      {
        code: `${IMPORT}export const v = (s, Row) => each(s.rows, Row);`,
        errors: [{ message: KEY }],
      },
      {
        code: `${IMPORT}export const v = (s) => each(s.rows, undefined, (r) => r);`,
        errors: [{ message: KEY }],
      },
    ],
  });

  tsTester.run('gyral/each-row-purity: TypeScript', rowPurityRule, {
    valid: [
      // A type declared in the view is not a value the row reads.
      `${IMPORT}export const view = (s: { rows: { id: number }[] }) => {
  type Row = { id: number };
  return each(s.rows, (r) => r.id, (r: Row) => html\`<li>\${r.id}</li>\`);
};`,
    ],
    invalid: [
      impure(
        'export const view = (s: { rows: number[]; on: number }) => each(s.rows, (n) => n, (n: number) => html`${n === s.on}`);',
        ['s.on', 's.on'],
      ),
    ],
  });
});
