// Indented templates (gyral-9rf): rendered by whitespace.node.test.ts, hydrated by
// whitespace-hydration.test.ts. One normalizer for server and client (view/01-templates.md).
import { define, each, html } from '@gyral/core';

interface Row {
  readonly id: number;
  readonly label: string;
}
interface State {
  readonly rows: readonly Row[];
  readonly name: string;
}
type Msg = { readonly _tag: 'Rename'; readonly name: string };

const init = (): State => ({
  rows: [
    { id: 1, label: 'one' },
    { id: 2, label: 'two' },
  ],
  name: 'Ada',
});
const update = { Rename: (s: State, m: Msg): State => ({ ...s, name: m.name }) };

export const WhitespaceTable = define<State, Msg>('test-ws-table', {
  init,
  intent: {},
  update,
  view: (s) => html`
    <p class="greeting">
      Hello <b>${s.name}</b>
      <em>again</em>
    </p>
    <table>
      <tbody>
        ${each(
          s.rows,
          (row) => row.id,
          (row) => html`
            <tr>
              <td class="id">${row.id}</td>
              <td>
                <button class="lbl" type="button">${row.label}</button>
              </td>
              <td>
                <button class="remove" type="button">x</button>
              </td>
            </tr>
          `,
        )}
      </tbody>
    </table>
    <pre class="code">
  keep   this
</pre>
  `,
});

export const WhitespaceLight = define<State, Msg>('test-ws-light', {
  shadow: false,
  init,
  intent: {},
  update,
  view: (s) => html`
    <p class="greeting">
      Hello <b>${s.name}</b>
      <em>again</em>
    </p>
  `,
});
