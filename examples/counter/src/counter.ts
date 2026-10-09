import { css, define, html } from '@gyral/core';

export interface State {
  readonly count: number;
}

export type Msg = { readonly _tag: 'Increment' } | { readonly _tag: 'Decrement' };

export const Counter = define<State, Msg>()('gy-counter', {
  init: () => ({ count: 0 }),
  intent: {
    Increment: () => ({ _tag: 'Increment' }),
    Decrement: () => ({ _tag: 'Decrement' }),
  },
  update: {
    Increment: (s) => ({ count: s.count + 1 }),
    Decrement: (s) => ({ count: s.count - 1 }),
  },
  view: (s, i) => html`
    <p>Counter: <output aria-live="polite">${s.count}</output></p>
    <div class="actions">
      <button type="button" data-intent=${i.Decrement}>Decrement</button>
      <button type="button" data-intent=${i.Increment}>Increment</button>
    </div>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
        --accent: oklch(55% 0.18 260);
      }
      output {
        font-variant-numeric: tabular-nums;
        font-weight: 700;
      }
      .actions {
        display: flex;
        gap: 0.5rem;
      }
      button {
        font: inherit;
        padding-block: 0.5rem;
        padding-inline: 1rem;
        border: 1px solid var(--accent);
        border-radius: 0.5rem;
        background: oklch(from var(--accent) l c h / 0.1);
        color: inherit;
        cursor: pointer;
      }
      button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-counter': InstanceType<typeof Counter>;
  }
}
