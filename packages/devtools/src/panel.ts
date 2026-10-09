// <gyral-devtools>: the in-page panel (ADR 0017). A Gyral component itself; install.ts filters
// its own events out of the stream so it never watches itself.
import { define, devtoolsEnabled, each, html, nothing, prop } from '@gyral/core';
import {
  componentLabel,
  initialPanel,
  preview,
  receive,
  ROW_KINDS,
  visibleRows,
  type PanelState,
  type RowKind,
} from './model.js';
import { panelStyles } from './styles.js';
import type { DevEvent } from '@gyral/core';

export const PANEL_TAG = 'gyral-devtools';

export type PanelMsg =
  | { readonly _tag: 'Received'; readonly events: readonly DevEvent[] }
  | { readonly _tag: 'Toggle' }
  | { readonly _tag: 'Filter'; readonly text: string }
  | { readonly _tag: 'Kind'; readonly kind: RowKind; readonly on: boolean }
  | { readonly _tag: 'Clear' };

const isKind = (v: string | undefined): v is RowKind => ROW_KINDS.some((k) => k === v);

const stateOf = (element: Element): unknown => (element as { readonly state?: unknown }).state;

const time = (at: number): string => `${(at / 1000).toFixed(3)}s`;

// List rows are pure (docs/design-docs/view/03-lists.md): they read only their item and pick.
type Row = PanelState['rows'][number];
type ComponentEntry = PanelState['components'][number];
type Lane = PanelState['lanes'][number];

const KindToggle = (kind: RowKind, { on, intent }: { on: boolean; intent: string }) =>
  html`<label
    ><input type="checkbox" value=${kind} ?checked=${on} data-intent=${intent} /> ${kind}</label
  >`;

const TimelineRow = (r: Row) =>
  html`<li data-kind=${r.kind}>
    <span class="at">${time(r.at)}</span>
    <span class="kind">${r.kind}</span>
    <code class="who">${r.who}</code>
    <strong class="what">${r.what}</strong>
    <span class="detail">${r.detail === '' ? nothing : r.detail}</span>
  </li>`;

const ComponentRow = (c: ComponentEntry, state: string) =>
  html`<li>
    <details>
      <summary><code>${componentLabel(c)}</code></summary>
      <pre>${state}</pre>
    </details>
  </li>`;

const LaneRow = (l: Lane) =>
  html`<tr>
    <td><code>${l.owner}</code></td>
    <td>${l.lane}</td>
    <td>${l.policy}</td>
    <td>${l.last}</td>
    <td>${l.inFlight}</td>
  </tr>`;

export const DevtoolsPanel = define<PanelState, PanelMsg, { readonly open: boolean }>()(PANEL_TAG, {
  props: { open: prop.boolean() },
  init: (props) => initialPanel(props.open),
  intent: {
    Toggle: () => ({ _tag: 'Toggle' }),
    Filter: ({ value }) => ({ _tag: 'Filter', text: value ?? '' }),
    Kind: ({ value, checked }) =>
      isKind(value) ? { _tag: 'Kind', kind: value, on: checked === true } : undefined,
    Clear: () => ({ _tag: 'Clear' }),
  },
  update: {
    Received: (s, m) => receive(s, m.events),
    Toggle: (s) => ({ ...s, open: !s.open }),
    Filter: (s, m) => ({ ...s, filter: m.text }),
    Kind: (s, m) => ({
      ...s,
      kinds: m.on
        ? ROW_KINDS.filter((k) => k === m.kind || s.kinds.includes(k))
        : s.kinds.filter((k) => k !== m.kind),
    }),
    Clear: (s) => ({ ...s, rows: [] }),
  },
  view: (s, i) => {
    const rows = visibleRows(s);
    return html`
      <button
        type="button"
        part="toggle"
        class="toggle"
        aria-expanded=${s.open ? 'true' : 'false'}
        aria-controls="gyral-devtools-panel"
        aria-keyshortcuts="Alt+Shift+D"
        data-intent=${i.Toggle}
      >
        Gyral devtools <span class="count">${s.rows.length}</span>
      </button>
      <section
        id="gyral-devtools-panel"
        part="panel"
        aria-labelledby="gyral-devtools-title"
        ?hidden=${!s.open}
      >
        <header>
          <h2 id="gyral-devtools-title">Gyral devtools</h2>
          ${
            devtoolsEnabled
              ? nothing
              : html`<p role="note">Events only flow in development builds.</p>`
          }
          <button type="button" data-intent=${i.Clear}>Clear timeline</button>
        </header>
        <details open>
          <summary>Timeline (${rows.length})</summary>
          <div class="filters">
            <label>Filter <input type="search" data-intent=${i.Filter} value=${s.filter} /></label>
            <fieldset>
              <legend>Show</legend>
              ${each(
                ROW_KINDS,
                (kind) => kind,
                KindToggle,
                (kind) => ({
                  on: s.kinds.includes(kind),
                  intent: i.Kind,
                }),
              )}
            </fieldset>
          </div>
          <ol class="timeline" aria-label="Events, newest first">
            ${each(rows, (r) => r.seq, TimelineRow)}
          </ol>
        </details>
        <details open>
          <summary>Components (${s.components.length})</summary>
          <ul class="components">
            ${each(
              s.components,
              (c) => c.id,
              ComponentRow,
              // The element's state changes without the row's item changing: pass it through pick.
              (c) => preview(stateOf(c.element), 2000),
            )}
          </ul>
        </details>
        <details open>
          <summary>Command lanes (${s.lanes.length})</summary>
          ${
            s.lanes.length === 0
              ? html`<p>No commands yet.</p>`
              : html`<table>
                  <thead>
                    <tr>
                      <th scope="col">Owner</th>
                      <th scope="col">Lane</th>
                      <th scope="col">Policy</th>
                      <th scope="col">Last</th>
                      <th scope="col">In flight</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${each(s.lanes, (l) => l.key, LaneRow)}
                  </tbody>
                </table>`
          }
        </details>
      </section>
    `;
  },
  styles: panelStyles,
});

declare global {
  interface HTMLElementTagNameMap {
    'gyral-devtools': InstanceType<typeof DevtoolsPanel>;
  }
}
