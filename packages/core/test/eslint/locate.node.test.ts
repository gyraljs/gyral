// Where gyral/template reports (@gyral/core/eslint): the normalizer's position in its minified
// cooked strings, mapped back through whitespace minification, escapes, line continuations and
// CRLF line ends to a line and column inside the template literal.
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import gyral from '../../src/eslint/index.js';
import { cookedMap, minifiedMap } from '../../src/eslint/locate.js';
import { spanOf } from './helpers.js';

const IMPORT = "import { html } from '@gyral/core';";

function lint(code: string): Linter.LintMessage[] {
  return new Linter().verify(code, [gyral.configs.recommended]);
}

/** Lints `code` and expects one gyral/template error spanning `at` (its last occurrence). */
function expectAt(code: string, at: string, rule: number): void {
  const messages = lint(code);
  expect(messages.map((m) => m.message)).toHaveLength(1);
  const [m] = messages;
  expect(m?.ruleId).toBe('gyral/template');
  expect(m?.message).toContain(`[gyral template rule ${String(rule)}]`);
  const occurrences = code.split(at).length - 2;
  const span = spanOf(code, at, occurrences);
  expect({
    line: m?.line,
    column: m?.column,
    endLine: m?.endLine,
    endColumn: m?.endColumn,
  }).toEqual(span);
}

describe('cookedMap', () => {
  it('maps cooked offsets through escapes, continuations and CRLF', () => {
    const text = 'a\\nb\\x41\\u00e9\\u{1F600}c\\\nd\r\ne\\`';
    const cooked = 'a\nbAé\u{1F600}cd\ne`';
    const map = cookedMap(text, cooked);
    expect(map).toBeDefined();
    const at = (k: number): string => text.slice(map?.[k], map?.[k + 1]);
    expect(at(0)).toBe('a');
    expect(at(1)).toBe('\\n');
    expect(at(3)).toBe('\\x41');
    expect(at(4)).toBe('\\u00e9');
    expect(text.slice(map?.[5], map?.[7])).toBe('\\u{1F600}');
    expect(at(7)).toBe('c\\\n'); // the continuation cooks to nothing
    expect(at(9)).toBe('\r\n');
    expect(at(11)).toBe('\\`');
    expect(map?.at(-1)).toBe(text.length);
  });

  it('gives up when the text does not cook to the string', () => {
    expect(cookedMap('a\\nb', 'anb')).toBeUndefined();
  });
});

describe('minifiedMap', () => {
  it('maps through collapsed and dropped whitespace, and copies <pre> verbatim', () => {
    const original = '<div>\n  <b>a  \n  b</b>\n</div><pre>  x  </pre>';
    const minified = '<div><b>a b</b></div><pre>  x  </pre>';
    const map = minifiedMap(original, minified);
    for (let k = 0; k < minified.length; k++) {
      const c = minified.charAt(k);
      if (c !== ' ') expect(original.charAt(map[k] ?? -1), `at ${String(k)}`).toBe(c);
    }
    expect(original.slice(map[minified.indexOf('<b>')])).toMatch(/^<b>a/);
    expect(original.slice(map[minified.indexOf('  x')])).toMatch(/^ {2}x {2}<\/pre>/);
  });
});

describe('gyral/template locations', () => {
  const lines = [
    IMPORT,
    'export const v = (s) => html`<p title="caf\\u00e9">a\\tb \\x41 \\u{1F600}</p>\\',
    '<div>',
    '    <span>x\\n   y</span>   ${s.x}   <my-el /></div>`;',
  ];

  it('points at the tag in a multi-line template with escapes', () => {
    expectAt(lines.join('\n'), '<my-el />', 6);
  });

  it('counts CRLF line ends like ESLint does', () => {
    expectAt(lines.join('\r\n'), '<my-el />', 6);
  });

  it('points at the hole for errors at a hole, after escapes on the same line', () => {
    expectAt(
      `${IMPORT}\nexport const v = (s) => html\`<b title="\\u00e9\\t">\n  <i \${s.a}x="1"></i></b>\`;`,
      '${s.a}',
      2,
    );
    expectAt(
      `${IMPORT}\nexport const v = (s) => html\`<p>\\n</p><script>\${s.a}</script>\`;`,
      '${s.a}',
      3,
    );
  });

  it('points at end tags and text', () => {
    expectAt(`${IMPORT}\nexport const v = html\`<div>\n  <span>\n    a\n  </div>\`;`, '</div>', 7);
    expectAt(
      `${IMPORT}\nexport const v = (s) => html\`<table>\n  <tbody><tr>stray \${s.a}</tr></tbody></table>\`;`,
      'stray ',
      7,
    );
  });

  it('spans a start tag that a hole splits', () => {
    expectAt(
      `${IMPORT}\nexport const v = (s) => html\`<input\n  type="checkbox"\n  .checked=\${s.on}\n>\`;`,
      '<input\n  type="checkbox"\n  .checked=${s.on}\n>',
      4,
    );
  });
});
