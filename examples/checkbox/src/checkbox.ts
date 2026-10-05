import { css, define, html, liveBoolean } from '@gyral/core';

export interface State {
  readonly on: boolean;
}

export type Msg = { readonly _tag: 'Toggled'; readonly on: boolean };

export const Checkbox = define<State, Msg>('gy-checkbox', {
  init: () => ({ on: false }),
  intent: {
    // Checkboxes fire their intent on `change`, and `checked` is read for us (ADR 0001).
    Toggled: ({ checked }) => ({ _tag: 'Toggled', on: checked === true }),
  },
  update: {
    Toggled: (_s, m) => ({ on: m.on }),
  },
  view: (s, i) => html`
    <p>
      <input id="toggle" type="checkbox" ?checked=${liveBoolean(s.on)} data-intent=${i.Toggled} />
      <label for="toggle">Toggle me</label>
    </p>
    <p>
      <output for="toggle" aria-live="polite" class=${s.on ? 'on' : 'off'}
        >${s.on ? 'ON' : 'off'}</output
      >
    </p>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
        --accent: oklch(60% 0.17 150);
      }
      p {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      input {
        inline-size: 1.25rem;
        block-size: 1.25rem;
      }
      @supports (accent-color: var(--accent)) {
        input {
          accent-color: var(--accent);
        }
      }
      input:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      output {
        font-size: 2rem;
        font-weight: 700;
        transition: color 150ms ease;
      }
      .on {
        color: var(--accent);
      }
      .off {
        color: color-mix(in oklch, currentColor 55%, transparent);
      }
      @media (prefers-reduced-motion: reduce) {
        output {
          transition: none;
        }
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-checkbox': InstanceType<typeof Checkbox>;
  }
}
