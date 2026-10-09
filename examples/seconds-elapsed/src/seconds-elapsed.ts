import { css, define, html } from '@gyral/core';
import { periodic } from '@gyral/time';

export interface State {
  readonly seconds: number;
}

export type Msg = { readonly _tag: 'Tick'; readonly seconds: number };

/** ISO 8601 duration for `<time datetime>`, e.g. 75 → "PT75S". */
export const duration = (seconds: number): string => `PT${String(seconds)}S`;

// The periodic command streams 1, 2, 3… one per second; the initial state supplies the 0
// shown before the first tick.
export const SecondsElapsed = define<State, Msg>()('gy-seconds-elapsed', {
  init: () => [{ seconds: 0 }, [periodic(1000, (seconds) => ({ _tag: 'Tick', seconds }))]],
  intent: {},
  update: {
    Tick: (_s, m) => ({ seconds: m.seconds }),
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

declare global {
  interface HTMLElementTagNameMap {
    'gy-seconds-elapsed': InstanceType<typeof SecondsElapsed>;
  }
}
