import { css, define, html } from '@gyral/core';
import { every } from '@gyral/time';

export interface State {
  /** The wall-clock time of the first tick (ms). */
  readonly since: number | undefined;
  readonly seconds: number;
}

export type Msg = { readonly _tag: 'Tick'; readonly now: number };

/** ISO 8601 duration for `<time datetime>`, e.g. 75 → "PT75S". */
export const duration = (seconds: number): string => `PT${String(seconds)}S`;

// A clock subscription: `every` sends the time at once and then once a second, for as long as
// the component is in the page (ADR 0025). Seconds are counted from the first tick.
export const SecondsElapsed = define<State, Msg>()('gy-seconds-elapsed', {
  init: () => ({ since: undefined, seconds: 0 }),
  subscriptions: () => [every(1000, (now) => ({ _tag: 'Tick', now }))],
  update: {
    Tick: (s, m) => {
      const since = s.since ?? m.now;
      return { since, seconds: Math.round((m.now - since) / 1000) };
    },
  },
  view: (s) => html`
    <p>
      Seconds elapsed
      <output aria-live="off"><time datetime=${duration(s.seconds)}>${s.seconds}</time></output>
    </p>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
      }
      output {
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        font-size: 1.5em;
        margin-inline-start: 0.5ch;
      }
    }
  `,
});
