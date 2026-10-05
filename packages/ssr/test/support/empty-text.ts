// Components whose text bindings start as '' on the server (gyral-4k7.12): rendered by
// empty-text.node.test.ts, hydrated by empty-text-hydration.test.ts.
import { define, html } from '@gyral/core';

interface State {
  readonly message: string;
  readonly label: string;
}
type Msg = { readonly _tag: 'Say'; readonly text: string };

const init = (): State => ({ message: '', label: '' });
const update = { Say: (s: State, m: Msg): State => ({ ...s, message: m.text, label: m.text }) };

export const EmptyText = define<State, Msg>('test-empty-text', {
  init,
  intent: {},
  update,
  view: (s) =>
    html`<p class="msg">${s.message}</p>
      <p class="mixed">Note: ${s.label}!</p>`,
});

export const EmptyLight = define<State, Msg>('test-empty-light', {
  shadow: false,
  init,
  intent: {},
  update,
  view: (s) => html`<p class="msg">${s.message}</p>`,
});
