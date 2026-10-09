import { css, define, html } from '@gyral/core';
import { periodic } from '@gyral/time';
import { chartClicks, drawChart, type ChartData } from './chart-driver.js';

export const TIMEFRAME_SECONDS = 1;

export interface State {
  /** Clicks in the current timeframe; reset by every tick. */
  readonly count: number;
  /** One entry per timeframe that had at least one click. */
  readonly history: readonly number[];
  /** The bar last clicked on the chart. */
  readonly inspected: number | undefined;
}

export type Msg =
  | { readonly _tag: 'Click' }
  | { readonly _tag: 'Tick' }
  | { readonly _tag: 'Inspect'; readonly bar: number };

export const toChart = (history: readonly number[]): ChartData => ({
  label: `Clicks per ${String(TIMEFRAME_SECONDS)} second`,
  values: history,
});

/** The first click of a timeframe starts a new bar; later ones grow it (as in the original). */
export function recordClick(s: State): State {
  const count = s.count + 1;
  const last = s.history.at(-1) ?? 0;
  const history = count === 1 ? [...s.history, 1] : [...s.history.slice(0, -1), last + 1];
  return { ...s, count, history };
}

export const Clicks = define<State, Msg>()('gy-clicks', {
  init: () => [
    { count: 0, history: [], inspected: undefined },
    [
      periodic(TIMEFRAME_SECONDS * 1000, () => ({ _tag: 'Tick' })),
      chartClicks((bar) => ({ _tag: 'Inspect', bar })),
    ],
  ],
  intent: {
    Click: () => ({ _tag: 'Click' }),
  },
  update: {
    Click: (s) => {
      const next = recordClick(s);
      return [next, [drawChart(toChart(next.history))]];
    },
    Tick: (s) => ({ ...s, count: 0 }),
    Inspect: (s, m) => ({ ...s, inspected: m.bar }),
  },
  view: (s, i) => html`
    <button type="button" data-intent=${i.Click}>Click me</button>
    <p>Clicks this second: <output aria-live="polite">${s.count}</output></p>
    <p>
      ${
        s.inspected === undefined
          ? 'Click a bar on the chart to inspect it.'
          : html`Bar ${s.inspected}: <output>${s.history[s.inspected] ?? 0}</output> clicks`
      }
    </p>
    <details>
      <summary>Chart data</summary>
      <table>
        <caption>
          ${toChart(s.history).label}
        </caption>
        <thead>
          <tr>
            <th scope="col">Bar</th>
            <th scope="col">Clicks</th>
          </tr>
        </thead>
        <tbody>
          ${s.history.map(
            (n, i) =>
              html`<tr>
                <th scope="row">${i}</th>
                <td>${n}</td>
              </tr>`,
          )}
        </tbody>
      </table>
    </details>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
        --accent: oklch(58% 0.16 240);
      }
      button {
        font: inherit;
        font-size: 1.25rem;
        padding-block: 1rem;
        padding-inline: 2rem;
        border: 1px solid var(--accent);
        border-radius: 0.75rem;
        background: oklch(from var(--accent) l c h / 0.12);
        color: inherit;
        cursor: pointer;
        touch-action: manipulation;
      }
      button:active {
        background: oklch(from var(--accent) l c h / 0.25);
      }
      button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      output {
        font-variant-numeric: tabular-nums;
        font-weight: 700;
      }
      table {
        border-collapse: collapse;
        margin-block-start: 0.5rem;
      }
      th,
      td {
        padding-block: 0.25rem;
        padding-inline: 0.75rem;
        text-align: end;
        border-block-end: 1px solid color-mix(in oklch, currentColor 20%, transparent);
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-clicks': InstanceType<typeof Clicks>;
  }
}
