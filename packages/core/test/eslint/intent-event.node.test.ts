// gyral/intent-event (@gyral/core/eslint, gyral-337.6): an intent whose parser is on('event', …)
// must be bound to that event, by data-intent-<event>, a static data-intent-on, or the element's
// default trigger.
import { describe } from 'vitest';
import { intentEventRule } from '../../src/eslint/intent-event-rule.js';
import { tester } from './helpers.js';

const IMPORT = "import { define, html, on } from '@gyral/core';\n";

/** A component whose `Move` parser is on('keydown') and `Pick` on('change'), with `view`. */
const component = (view: string): string =>
  `${IMPORT}
define()('x-a', {
  init: () => ({}),
  intent: { Move: on('keydown', () => ({ _tag: 'Move' })), Pick: on('change', () => ({ _tag: 'Pick' })), Go: true },
  update: { Move: (s) => s, Pick: (s) => s, Go: (s) => s },
  view: ${view},
});
`;

const other = (name: string, expected: string, actual: string) => ({
  messageId: 'other',
  data: { name, expected, actual },
});

describe('gyral/intent-event', () => {
  tester.run('gyral/intent-event', intentEventRule, {
    valid: [
      // The named event, a static data-intent-on, and an element whose default trigger matches.
      component(
        '(s, i) => html`<div data-intent-keydown=${i.Move}></div><p data-intent-on="keydown" data-intent=${i.Move}></p><select data-intent=${i.Pick}></select><input type="checkbox" data-intent=${i.Pick}>`',
      ),
      // A plain parser binds to anything; a bound data-intent-on can't be read here.
      component(
        '(s, i) => html`<button data-intent=${i.Go}></button><p data-intent-on=${s.on} data-intent=${i.Move}></p>`',
      ),
      // A quoted data-intent-on lists several events: each one counts, not only the first; one
      // bound in part can't be read.
      component('(s, i) => html`<p data-intent=${i.Move} data-intent-on="keyup keydown"></p>`'),
      component('(s, i) => html`<p data-intent=${i.Move} data-intent-on="click ${s.on}"></p>`'),
    ],
    invalid: [
      {
        code: component('(s, i) => html`<button type="button" data-intent=${i.Move}>go</button>`'),
        errors: [other('Move', 'keydown', '"click"')],
      },
      {
        code: component(
          '(s, i) => html`<input data-intent=${i.Pick}><div data-intent-keyup=${i.Move}></div>`',
        ),
        errors: [other('Pick', 'change', '"input"'), other('Move', 'keydown', '"keyup"')],
      },
    ],
  });
});
