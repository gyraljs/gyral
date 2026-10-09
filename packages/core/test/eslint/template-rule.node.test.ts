// gyral/template (@gyral/core/eslint, view/09-template-rules.md "One rule set, three places"):
// every rule the normalizer checks, reported with the runtime's own message at the markup it is
// about. Expected messages come from normalize() itself, so they can't drift apart.
import { RuleTester } from 'eslint';
import { describe } from 'vitest';
import { templateRule } from '../../src/eslint/template-rule.js';
import { runtimeMessage, spanOf, tester, tsTester } from './helpers.js';

const IMPORT = "import { html } from '@gyral/core';\n";

/** The cooked strings of a template body written as source (no escapes in these bodies). */
const stringsOf = (body: string): string[] => body.split(/\$\{[^}]*\}/);

/** An invalid case: `body` inside html`…`, the error spanning the `n`th `at`. */
function bad(body: string, at: string, n = 0): RuleTester.InvalidTestCase {
  const code = `${IMPORT}export const v = (x) => html\`${body}\`;\n`;
  // Occurrences of `at` before the template (in the import line or the prefix) are skipped.
  const skip = code.slice(0, code.indexOf('html`') + 5).split(at).length - 1;
  return {
    code,
    errors: [{ message: runtimeMessage(stringsOf(body)), ...spanOf(code, at, skip + n) }],
  };
}

/** An invalid case whose one error spans the first `at` after the first backtick. */
function located(
  code: string,
  at: string,
  strings: readonly string[],
  extra: Partial<RuleTester.InvalidTestCase> = {},
): RuleTester.InvalidTestCase {
  const skip = code.slice(0, code.indexOf('`')).split(at).length - 1;
  return {
    code,
    errors: [{ message: runtimeMessage(strings), ...spanOf(code, at, skip) }],
    ...extra,
  };
}

const DIV = ['<div/>'];

describe('gyral/template', () => {
  tester.run('gyral/template', templateRule, {
    valid: [
      `${IMPORT}export const v = (s) => html\`<p class="a \${s.c}">\${s.text}</p>\`;`,
      `${IMPORT}export const v = (s) => html\`<ul>\${s.items.map((n) => html\`<li>\${n}</li>\`)}</ul>\`;`,
      `${IMPORT}export const v = (s) => html\`<my-input .value=\${s.v}></my-input><input value=\${s.v}>\`;`,
      // Per-event intent attributes, bound and static (gyral-dyn.15).
      `${IMPORT}export const v = (s, i) => html\`<li data-intent-pointerdown=\${i.Grab} data-intent-keydown="Key" data-intent-on="focusin focusout" data-intent=\${i.Focus}></li>\`;`,
      // Rule 11 is the runtime's: a page shell is fine on the server.
      `${IMPORT}export const page = (b) => html\`<!doctype html><html><body>\${b}</body></html>\`;`,
      // Not Gyral's html: another library's, a shadowing local, an untagged template.
      "import { html } from 'other-renderer';\nexport const v = html`<div/>`;",
      `${IMPORT}export const f = (html) => html\`<div/>\`;`,
      `${IMPORT}export const s = \`<div/>\`;`,
      'const html = (s) => s;\nexport const v = html`<div/>`;',
    ],
    invalid: [
      // 1: event bindings
      bad('<button @click=${x}></button>', '${x}'),
      bad('<button @click="${x}"></button>', '${x}'),
      // 2: dynamic tag and attribute names
      bad('<${x}></p>', '<${x}'),
      bad('<p></${x}>', '</${x}'),
      bad('<p ${x}="y"></p>', '${x}'),
      // 3: holes in raw text, comments, <template>
      bad('<script>let a = ${x}</script>', '${x}'),
      bad('<style>p { color: ${x} }</style>', '${x}'),
      bad('<!-- ${x} -->', '${x}'),
      bad('<template><p>${x}</p></template>', '${x}'),
      // 4: form state as a property
      bad('<input type="checkbox" .checked=${x}>', '<input type="checkbox" .checked=${x}>'),
      bad('<details .open=${x}></details>', '<details .open=${x}>'),
      // 5: unquoted multi-part attributes, static text with ? or .
      bad('<b class=a${x}></b>', '${x}'),
      bad('<b ?hidden="x ${x}"></b>', '>'),
      // 6: self-closing non-void elements
      bad('<div>\n  <my-el />\n</div>', '<my-el />'),
      bad('<div/>', '<div/>'),
      // 7: repairs, mismatched and duplicate markup, unterminated markup
      bad('<table><tr><td>${x}</td></tr></table>', '<tr>'),
      bad('<p>a <div>b</div></p>', '<div>'),
      bad('<div><span></div>', '</div>'),
      bad('<b class="a" class=${x}></b>', '<b class="a" class=${x}>'),
      bad('<p>a </> b</p>', '<', 1),
      bad('<p>${x}<b', 'b'),
      // 10: SVG-only elements outside <svg>
      bad('<g>${x}</g>', '<g>'),
      // 12: a text-content hole that isn't the whole content
      bad('<title>${x} | Site</title>', '</title>'),
      // 13: unknown named references in decoded attribute text
      bad('<b class="&copy; ${x}"></b>', '<b class="&copy; ${x}">'),
    ],
  });

  tester.run('gyral/template: aliases, namespaces and sources', templateRule, {
    valid: [
      {
        code: "import { html } from '@gyral/core';\nexport const v = html`<div/>`;",
        options: [{ sources: ['my-lib'] }],
      },
    ],
    invalid: [
      located(
        "import { html as h } from '@gyral/core';\nexport const v = h`<div/>`;",
        '<div/>',
        DIV,
      ),
      located("import * as g from '@gyral/core';\nexport const v = g.html`<div/>`;", '<div/>', DIV),
      located("import { html } from 'my-lib';\nexport const v = html`<div/>`;", '<div/>', DIV, {
        options: [{ sources: ['my-lib'] }],
      }),
      // Core's own code imports the view module by path.
      located(
        "import { html } from './view/index.js';\nexport const v = html`<div/>`;",
        '<div/>',
        DIV,
        {
          filename: new URL('../../src/fixture.ts', import.meta.url).pathname,
        },
      ),
      located(
        "import { html } from '../../src/view/template.js';\nexport const v = html`<div/>`;",
        '<div/>',
        DIV,
        { filename: new URL('./fixture.test.ts', import.meta.url).pathname },
      ),
      // A nested template is checked on its own.
      located(
        "import { html } from '@gyral/core';\nexport const v = html`<p>${html`<div/>`}</p>`;",
        '<div/>',
        DIV,
      ),
      {
        code: "import { html } from '@gyral/core';\nexport const v = html`<p>\\x`;",
        errors: [{ messageId: 'escape' }],
      },
    ],
  });

  // Views attach no closures (view/02 "Properties", gyral-g1r.28): a function written in a hole.
  tester.run('gyral/template: closures in holes', templateRule, {
    valid: [
      `${IMPORT}const go = () => 1;\nexport const v = html\`<button .onclick=\${go}>x</button>\`;`,
      `${IMPORT}export const v = (xs) => html\`<ul>\${xs.map((x) => html\`<li>\${x}</li>\`)}</ul>\`;`,
    ],
    invalid: [
      {
        code: `${IMPORT}export const v = html\`<button .onclick=\${() => 1}>x</button>\`;`,
        errors: [{ messageId: 'closure', line: 2, column: 42 }],
      },
      {
        code: `${IMPORT}export const v = html\`<p>\${function () {}}</p><i title=\${() => 2}></i>\`;`,
        errors: [{ messageId: 'closure' }, { messageId: 'closure' }],
      },
      {
        // svg templates too (view/01 "svg templates").
        code: "import { svg } from '@gyral/core';\nexport const v = svg`<g .onclick=${() => 1}></g>`;",
        errors: [{ messageId: 'closure', line: 2, column: 36 }],
      },
    ],
  });

  // svg templates (view/01 "svg templates"): the same engine, with the top level as SVG content.
  const SVG = "import { svg } from '@gyral/core';\n";
  const NESTED =
    "import { html, svg as s } from '@gyral/core';\nexport const v = html`<svg>${s`<g><input></g>`}</svg>`;";
  tester.run('gyral/template: svg templates', templateRule, {
    valid: [
      `${SVG}export const v = (s) => svg\`<path d=\${s.d} /><g class=\${s.c}>\${s.t}</g>\`;`,
      `${SVG}export const v = (s) => svg\`<foreignObject><p>\${s.t}</p></foreignObject>\`;`,
      'import * as g from \'@gyral/core\';\nexport const v = g.svg`<circle r="1" />`;',
      // Not Gyral's svg.
      "import { svg } from 'other-renderer';\nexport const v = svg`<div></div>`;",
    ],
    invalid: [
      {
        code: `${SVG}export const v = (x) => svg\`<g>\${x}</g><div>\${x}</div>\`;`,
        errors: [
          {
            message: runtimeMessage(['<g>', '</g><div>', '</div>'], true),
            ...spanOf(
              `${SVG}export const v = (x) => svg\`<g>\${x}</g><div>\${x}</div>\`;`,
              '<div>',
            ),
          },
        ],
      },
      {
        code: `${SVG}export const v = (x) => svg\`<use xlink:href=\${x} />\`;`,
        errors: [{ message: runtimeMessage(['<use xlink:href=', ' />'], true) }],
      },
      {
        code: NESTED,
        errors: [
          { message: runtimeMessage(['<g><input></g>'], true), ...spanOf(NESTED, '<input>') },
        ],
      },
    ],
  });

  tsTester.run('gyral/template: TypeScript', templateRule, {
    valid: ["import type { html } from '@gyral/core';\ndeclare const h: typeof html;\nh`<div/>`;"],
    invalid: [
      located(
        "import { html } from '@gyral/core';\nexport const v = (n: number): unknown => html`<g>${n}</g>`;",
        '<g>',
        ['<g>', '</g>'],
      ),
    ],
  });
});
