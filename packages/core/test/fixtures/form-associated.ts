import { define, html } from '../../src/index.js';

interface State {
  readonly value: string;
  readonly live: boolean;
  readonly disabled: boolean;
}
type Msg = { readonly _tag: 'Edited'; readonly value: string };
export const Field = define<State, Msg>()('test-form-ssr-field', {
  init: () => ({ value: 'server', live: false, disabled: false }),
  intent: { Edited: ({ value }) => ({ _tag: 'Edited', value: value ?? '' }) },
  update: {
    Edited: (s, m) => ({ ...s, value: m.value, live: true }),
    FormDisabled: (s, m) => ({ ...s, disabled: m.disabled }),
    FormReset: (s) => ({ ...s, value: 'server' }),
  },
  formAssociated: { value: (s) => (s.live ? s.value : null) },
  view: (s, i) =>
    html`<label
      >Value
      <input
        name=${s.live ? undefined : 'choice'}
        value=${s.value}
        ?disabled=${s.disabled}
        data-intent=${i.Edited}
        data-intent-on="input"
    /></label>`,
  shadow: false,
});
export const page = () =>
  html`<form><test-form-ssr-field name="choice"></test-form-ssr-field></form>`;
