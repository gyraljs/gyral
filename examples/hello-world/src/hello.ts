import { css, define, html } from '@gyral/core';

export interface State {
  readonly name: string;
}

export type Msg = { readonly _tag: 'Named'; readonly name: string };

export const Hello = define<State, Msg>('gy-hello', {
  init: () => ({ name: '' }),
  intent: {
    Named: ({ value }) => ({ _tag: 'Named', name: value ?? '' }),
  },
  update: {
    Named: (_s, m) => ({ name: m.name }),
  },
  view: (s, i) => html`
    <p>
      <label for="name">Name</label>
      <input id="name" name="name" type="text" autocomplete="given-name" data-intent=${i.Named} />
    </p>
    <hr />
    <output for="name" aria-live="polite">Hello ${s.name.trim()}</output>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
        --accent: oklch(55% 0.18 300);
      }
      p {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      input {
        font: inherit;
        padding-block: 0.4rem;
        padding-inline: 0.75rem;
        border: 1px solid color-mix(in oklch, currentColor 40%, transparent);
        border-radius: 0.5rem;
        background: transparent;
        color: inherit;
      }
      input:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      hr {
        border: none;
        border-block-start: 1px solid color-mix(in oklch, currentColor 20%, transparent);
        margin-block: 1rem;
      }
      output {
        display: block;
        font-size: 2rem;
        font-weight: 700;
        text-wrap: balance;
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-hello': InstanceType<typeof Hello>;
  }
}
