// gyral/prefer-built-in's jsonProp check follows a define() spec's props parameter by its
// position, whatever it is named or however it is destructured (gyral-bt4): gathered-wishes'
// `init: (p) => ({ a: JSON.parse(p.a) })` gave no warning while `init: (props) => …` did.
import { describe } from 'vitest';
import { preferBuiltInRule } from '../../src/eslint/prefer-built-in-rule.js';
import { tester, tsTester } from './helpers.js';

const IMPORT = "import { define, html, on } from '@gyral/core';\n";

/** A component with the given spec members (the view by default reads nothing). */
const spec = (members: string, view = 'view: (s) => html`<p></p>`'): string =>
  `${IMPORT}define()('x-a', { ${members}, update: { X: (s) => s }, ${view} });\n`;

const jsonProp = { messageId: 'jsonProp' };

describe('gyral/prefer-built-in jsonProp: props by position (gyral-bt4)', () => {
  tester.run('jsonProp by position', preferBuiltInRule, {
    valid: [
      // The other parameters: state, the intents, a message, the intent's input.
      spec(
        "init: () => ({}), intent: { X: (input) => ({ _tag: 'X', row: JSON.parse(input.value) }) }",
        'view: (s, i, c) => html`<p>${JSON.parse(s.raw).length}</p>`',
      ),
      `${IMPORT}define()('x-a', { init: () => ({}), update: { X: (s, m) => ({ row: JSON.parse(m.text) }) }, view: ({ raw }) => html\`<p>\${JSON.parse(raw)}</p>\` });`,
      // subscriptions' state, and a state destructured in the view.
      spec(
        'init: () => ({}), subscriptions: (s) => (JSON.parse(s.raw) ? [] : [])',
        'view: ({ items }) => html`<p>${JSON.parse(items)}</p>`',
      ),
      // A field inside a prop is the prop's data, not the attribute.
      spec('init: ({ config: { raw } }) => ({ a: JSON.parse(raw) })'),
      // Something else read through the context: a store.
      spec('init: () => ({})', 'view: (s, i, c) => html`<p>${JSON.parse(c.read(store).raw)}</p>`'),
      // Not Gyral's define().
      "import { define } from 'elsewhere';\nimport { html } from '@gyral/core';\ndefine()('x-a', { init: (p) => ({ a: JSON.parse(p.a) }) });",
    ],
    invalid: [
      // gathered-wishes: a props parameter named p, and one destructured.
      { code: spec('init: (p) => ({ a: JSON.parse(p.a) })'), errors: [jsonProp] },
      {
        code: spec(
          "init: ({ items, raw = '[]' }) => ({ a: JSON.parse(items), b: JSON.parse(raw) })",
        ),
        errors: [jsonProp, jsonProp],
      },
      // Renamed, defaulted, and the rest of the props.
      {
        code: spec(
          "init: ({ items: list = '[]', ...rest }) => ({ a: JSON.parse(list), b: JSON.parse(rest.b) })",
        ),
        errors: [jsonProp, jsonProp],
      },
      // subscriptions(state, props).
      {
        code: spec(
          'init: () => ({}), subscriptions: (s, attrs) => (JSON.parse(attrs.live) ? [] : [])',
        ),
        errors: [jsonProp],
      },
      // The context's props, destructured under another name or down to a prop, in the view
      // (also as a method), a reducer, an intent parser, an on() parser and formAssociated.
      {
        code: spec(
          'init: () => ({})',
          'view: (s, i, { props: p }) => html`<p>${JSON.parse(p.items)}</p>`',
        ),
        errors: [jsonProp],
      },
      {
        code: spec(
          'init: () => ({})',
          'view(s, i, { props: { items } }) { return html`<p>${JSON.parse(items)}</p>`; }',
        ),
        errors: [jsonProp],
      },
      {
        code: `${IMPORT}define()('x-a', { init: () => ({}), update: { X: (s, m, { props: { rows } }) => ({ rows: JSON.parse(rows) }) }, view: (s) => html\`<p></p>\` });`,
        errors: [jsonProp],
      },
      {
        code: spec(
          "init: () => ({}), intent: { X: (input, { props: p }) => ({ _tag: 'X', a: JSON.parse(p.a) }), Y: on('click', (input, { props: { b } }) => ({ _tag: 'X', b: JSON.parse(b) })) }",
        ),
        errors: [jsonProp, jsonProp],
      },
      {
        code: spec(
          'init: () => ({}), formAssociated: { value: (s, { props: p }) => JSON.parse(p.value) }',
        ),
        errors: [jsonProp],
      },
      {
        // An init bound in the module, before define() is reached.
        code: `${IMPORT}const start = (attrs) => ({ a: JSON.parse(attrs.a) });\ndefine()('x-a', { init: start, update: {}, view: (s) => html\`<p></p>\` });`,
        errors: [jsonProp],
      },
    ],
  });

  tsTester.run('jsonProp by position, typed', preferBuiltInRule, {
    valid: [],
    invalid: [
      {
        code: spec(
          "init: (p: Props) => ({ a: JSON.parse(p.a as string), b: JSON.parse(p['b'] ?? '[]') })",
        ),
        errors: [jsonProp, jsonProp],
      },
      {
        code: spec('init: ({ items }: { items: string }) => ({ items: JSON.parse(items) })'),
        errors: [jsonProp],
      },
    ],
  });
});
