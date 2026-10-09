import { css, define, defineStore, html, send } from '@gyral/core';
import { delay } from '@gyral/time/delay';

/** A shared store, so the timeline shows store messages too. */
export const tally = defineStore<{ readonly total: number }, { readonly _tag: 'Add' }>('tally', {
  init: () => ({ total: 0 }),
  update: { Add: (s) => ({ total: s.total + 1 }) },
});

export interface State {
  readonly count: number;
  readonly saving: boolean;
}

export type Msg =
  { readonly _tag: 'Increment' } | { readonly _tag: 'Save' } | { readonly _tag: 'Saved' };

/** Increment updates state and the store; Save runs a delayed command (a command lane). */
export const Demo = define<State, Msg>()('gy-devtools-demo', {
  init: () => ({ count: 0, saving: false }),
  stores: [tally],
  intent: {
    Increment: () => ({ _tag: 'Increment' }),
    Save: () => ({ _tag: 'Save' }),
  },
  update: {
    Increment: (s) => [{ ...s, count: s.count + 1 }, [send(tally, { _tag: 'Add' })]],
    Save: (s) => [
      { ...s, saving: true },
      [delay<Msg>(400, { _tag: 'Saved' }, { key: 'save', concurrency: 'switch' })],
    ],
    Saved: (s) => ({ ...s, saving: false }),
  },
  view: (s, i, { read }) => html`
    <p>Count: <output>${s.count}</output> · Store total: <output>${read(tally).total}</output></p>
    <p>
      <button type="button" data-intent=${i.Increment}>Increment</button>
      <button type="button" data-intent=${i.Save}>${s.saving ? 'Saving…' : 'Save'}</button>
    </p>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
      }
      button {
        font: inherit;
        padding-block: 0.4rem;
        padding-inline: 0.9rem;
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-devtools-demo': InstanceType<typeof Demo>;
  }
}
