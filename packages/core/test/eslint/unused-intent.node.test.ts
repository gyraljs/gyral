// gyral/unused-intent (@gyral/core/eslint; view/09-template-rules.md "Warnings",
// gyral-g1r.25): an intent parser that no template in the module names with data-intent.
// Static over the module, so intents rendered conditionally count as used; components whose
// intent names may be used in another module are skipped.
import { describe } from 'vitest';
import { unusedIntentRule } from '../../src/eslint/index.js';
import { tester, tsTester } from './helpers.js';

const IMPORT = "import { define, html, intents, each } from '@gyral/core';\n";

/** A component with parsers `Save` and `Load` and the given view (source). */
const component = (view: string, before = ''): string =>
  `${IMPORT}${before}
define('x-a', {
  init: () => ({ open: false, items: [] }),
  intent: { Save: () => ({ _tag: 'Save' }), Load: () => ({ _tag: 'Load' }) },
  update: { Save: (s) => s, Load: (s) => s, Done: (s) => s },
  view: ${view},
});
`;

const unused = (name: string) => ({ messageId: 'unused', data: { name } });

describe('gyral/unused-intent', () => {
  tester.run('gyral/unused-intent', unusedIntentRule, {
    valid: [
      // Both named, one only in a branch that may never render.
      component(
        '(s, i) => html`<button data-intent=${i.Save}>Save</button>${s.open ? html`<button data-intent=${i.Load}></button>` : ""}`',
      ),
      // A module-level intents() constant in a pure row, and a static data-intent value.
      component(
        '(s) => html`<ul>${each(s.items, (x) => x.id, Row)}</ul><form data-intent="Load"></form>`',
        'const r = intents();\nconst Row = (x) => html`<li data-intent=${r.Save}>${x.id}</li>`;\n',
      ),
      // Destructured intents, a literal data-intent hole, and a local helper getting `i`.
      component("(s, { Save }) => html`<b data-intent=${Save}></b><i data-intent=${'Load'}></i>`"),
      component(
        '(s, i) => toolbar(i)',
        'const toolbar = (i) => html`<b data-intent=${i.Save}></b><b data-intent=${i.Load}></b>`;\n',
      ),
      // Skipped: the view is imported, the view hands its intents to an imported function, a
      // template calls an imported function (its markup may name intents), intents exported.
      component('view', "import { view } from './view.js';\n"),
      component('(s, i) => toolbar(i)', "import { toolbar } from './toolbar.js';\n"),
      component(
        '(s, i) => html`<p data-intent=${i.Save}>${header("Load")}</p>`',
        "import { header } from './table.js';\n",
      ),
      component('(s, i) => html`<p data-intent=${i.Save}></p>`', 'export const i2 = intents();\n'),
      // svg fragments name intents too: a static value, and an imported function in a hole.
      component(
        '(s, i) => html`<svg data-intent=${i.Save}>${svg`<g data-intent="Load"></g>`}</svg>`',
        "import { svg } from '@gyral/core';\n",
      ),
      component(
        '(s, i) => html`<svg data-intent=${i.Save}>${svg`<g>${pips(3)}</g>`}</svg>`',
        "import { svg } from '@gyral/core';\nimport { pips } from './pips.js';\n",
      ),
      // Per-event attributes name intents too: a property, a static value and a literal hole.
      component(
        '(s, i) => html`<b data-intent-pointerdown=${i.Save} data-intent-keyup="Load"></b>`',
      ),
      component(
        "(s, i) => html`<b data-intent-click=${i.Save} data-intent-focusin=${'Load'}></b>`",
      ),
      // Not Gyral's define.
      "import { define } from 'elsewhere';\ndefine('x', { intent: { A: () => 1 }, view: () => 1 });",
    ],
    invalid: [
      {
        // data-intent-on's value is events, not an intent name.
        code: component('(s, i) => html`<b data-intent=${i.Save} data-intent-on="Load"></b>`'),
        errors: [unused('Load')],
      },
      {
        code: component('(s, i) => html`<button data-intent=${i.Save}>Save</button>`'),
        errors: [{ ...unused('Load'), line: 5, column: 45 }],
      },
      {
        // Message tags in reducers or parsers don't count, nor a formatter from core.
        code: component('function (s) { return html`<p>${s.open ? "Load" : "Save"}</p>`; }'),
        errors: [unused('Save'), unused('Load')],
      },
      {
        // A view bound to a module-level function is followed.
        code: component(
          'View',
          'function View(s, i) { return html`<p data-intent=${i.Load}></p>`; }\n',
        ),
        errors: [unused('Save')],
      },
    ],
  });

  tsTester.run('gyral/unused-intent: TypeScript', unusedIntentRule, {
    valid: [],
    invalid: [
      {
        code: `${IMPORT}type Msg = { readonly _tag: 'Go' } | { readonly _tag: 'Stop' };
const i = intents<Msg>();
define<object, Msg>('x-b', {
  intent: { Go: () => ({ _tag: 'Go' }), Stop: () => ({ _tag: 'Stop' }) },
  update: { Go: (s) => s, Stop: (s) => s },
  view: () => html\`<button data-intent=\${i.Go}>Go</button>\`,
});
`,
        errors: [unused('Stop')],
      },
    ],
  });
});
