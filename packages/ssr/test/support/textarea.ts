// A component with a model-driven <textarea> (gyral-czi.34, view/02-bindings.md "Live form
// state"): rendered by textarea.node.test.ts, hydrated by textarea-hydration.test.ts.
import { define, html } from '@gyral/core';

interface State {
  readonly message: string;
  readonly invalid: boolean;
}
type Msg =
  | { readonly _tag: 'Typed'; readonly text: string }
  | { readonly _tag: 'Reset' }
  | { readonly _tag: 'Flag' };

/** Markup characters in a bound attribute: the server escapes `<` and `>` there too (06). */
export const PLACEHOLDER = 'Say <hi> & "bye"';

export const Note = define<State, Msg>()('test-note', {
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
      <textarea
        id="msg"
        name="message"
        rows="3"
        required
        placeholder=${PLACEHOLDER}
        aria-invalid=${s.invalid ? 'true' : null}
        data-intent=${i.Typed}
      >
${s.message}</textarea>
      <button type="button" data-intent=${i.Reset}>Reset</button>`,
});
