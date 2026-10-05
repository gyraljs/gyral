// A component with a model-driven <textarea> (gyral-czi.34): rendered by
// textarea.node.test.ts, hydrated by textarea-hydration.test.ts.
import { define, html, textarea } from '@gyral/core';

interface State {
  readonly message: string;
  readonly invalid: boolean;
}
type Msg =
  | { readonly _tag: 'Typed'; readonly text: string }
  | { readonly _tag: 'Reset' }
  | { readonly _tag: 'Flag' };

export const Note = define<State, Msg>('test-note', {
  init: () => ({ message: 'Hello </textarea><b>x</b> & "q"', invalid: false }),
  intent: {
    Typed: ({ value }) => ({ _tag: 'Typed', text: value ?? '' }),
    Reset: () => ({ _tag: 'Reset' }),
  },
  update: {
    Typed: (s, m) => ({ ...s, message: m.text }),
    Reset: (s) => ({ ...s, message: '' }),
    Flag: (s) => ({ ...s, invalid: !s.invalid }),
  },
  view: (s, i) =>
    html`<label for="msg">Message</label>
      ${textarea({
        value: s.message,
        attrs: {
          id: 'msg',
          name: 'message',
          rows: 3,
          required: true,
          'aria-invalid': s.invalid ? 'true' : false,
          'data-intent': i.Typed,
        },
      })}
      <button type="button" data-intent=${i.Reset}>Reset</button>`,
});
