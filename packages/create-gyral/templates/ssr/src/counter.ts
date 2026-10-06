import { css, define, html, prop } from '@gyral/core';

// A widget: renders into its own shadow root (Declarative Shadow DOM on the server).
export interface State {
  readonly count: number;
}

export type Msg = { readonly _tag: 'Increment' } | { readonly _tag: 'Decrement' };

export interface Props {
  readonly start: number;
}

export const Counter = define<State, Msg, Props>('app-counter', {
  // Props are inputs (attributes or properties). The server-rendered value travels to the
  // browser in the hydration seed, so the page starts where the server left it.
  props: { start: prop.number({ default: 0 }) },
  init: (props) => ({ count: props.start }),
  intent: {
    Increment: () => ({ _tag: 'Increment' }),
    Decrement: () => ({ _tag: 'Decrement' }),
  },
  update: {
    Increment: (s) => ({ count: s.count + 1 }),
    Decrement: (s) => ({ count: s.count - 1 }),
  },
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
