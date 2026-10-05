import { css, define, html } from '@gyral/core';

// Model: the component's whole state.
export interface State {
  readonly count: number;
}

// Messages: everything that can happen to the state.
export type Msg = { readonly _tag: 'Increment' } | { readonly _tag: 'Decrement' };

export const Counter = define<State, Msg>('app-counter', {
  init: () => ({ count: 0 }),
  // Intent: DOM events on elements marked with data-intent become messages.
  intent: {
    Increment: () => ({ _tag: 'Increment' }),
    Decrement: () => ({ _tag: 'Decrement' }),
  },
  // Update: pure functions from (state, message) to the next state.
  update: {
    Increment: (s) => ({ count: s.count + 1 }),
    Decrement: (s) => ({ count: s.count - 1 }),
  },
  // View: a pure function of the state.
  view: (s, i) => html`
    <p>Count: <output aria-live="polite">${s.count}</output></p>
    <div class="actions">
      <button type="button" data-intent=${i.Decrement}>Decrement</button>
      <button type="button" data-intent=${i.Increment}>Increment</button>
    </div>
  `,
  styles: css`
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
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    button:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'app-counter': InstanceType<typeof Counter>;
  }
}
