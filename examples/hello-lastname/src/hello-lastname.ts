import { css, define, html } from '@gyral/core';

export interface State {
  readonly first: string;
  readonly last: string;
}

export type Msg =
  | { readonly _tag: 'First'; readonly value: string }
  | { readonly _tag: 'Last'; readonly value: string };

/** Minimum last-name length before a greeting is shown (from the Cycle.js original). */
export const MIN_LAST = 3;

/**
 * Derived from state, never stored: "LAST, First" once both parts are valid, else ''.
 * The Cycle.js original needed three streams (raw, valid, invalid) to express this.
 */
export const fullName = ({ first, last }: State): string =>
  first.length > 0 && last.length >= MIN_LAST ? `${last.toUpperCase()}, ${first}` : '';

export const HelloLastname = define<State, Msg>('gy-hello-lastname', {
  init: () => ({ first: '', last: '' }),
  intent: {
    First: ({ value }) => ({ _tag: 'First', value: value ?? '' }),
    Last: ({ value }) => ({ _tag: 'Last', value: value ?? '' }),
  },
  update: {
    First: (s, m) => ({ ...s, first: m.value }),
    Last: (s, m) => ({ ...s, last: m.value }),
  },
  view: (s, i) => html`
    <fieldset>
      <legend>Your name</legend>
      <p>
        <label for="first">First name</label>
        <input id="first" type="text" autocomplete="given-name" data-intent=${i.First} />
      </p>
      <p>
        <label for="last">Last name</label>
        <input
          id="last"
          type="text"
          autocomplete="family-name"
          minlength=${MIN_LAST}
          aria-describedby="last-hint"
          data-intent=${i.Last}
        />
        <small id="last-hint">At least ${MIN_LAST} letters.</small>
      </p>
    </fieldset>
    <h2><output for="first last" aria-live="polite">Hello ${fullName(s)}</output></h2>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
        --accent: oklch(55% 0.18 30);
      }
      fieldset {
        display: grid;
        gap: 0.75rem;
        border: 1px solid color-mix(in oklch, currentColor 25%, transparent);
        border-radius: 0.75rem;
        padding: 1rem;
      }
      p {
        display: grid;
        grid-template-columns: 7rem 1fr;
        align-items: center;
        gap: 0.25rem 0.75rem;
        margin: 0;
      }
      small {
        grid-column: 2;
        color: color-mix(in oklch, currentColor 65%, transparent);
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
      input:user-invalid {
        border-color: oklch(55% 0.2 25);
      }
      h2 {
        text-wrap: balance;
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-hello-lastname': InstanceType<typeof HelloLastname>;
  }
}
