import { css, define, html } from '@gyral/core';

export interface State {
  readonly first: string;
  readonly last: string;
  readonly formal: boolean;
}

export type Msg =
  | { readonly _tag: 'First'; readonly value: string }
  | { readonly _tag: 'Last'; readonly value: string }
  | { readonly _tag: 'Formal'; readonly on: boolean };

/** Minimum last-name length before the formal greeting uses it. */
export const MIN_LAST = 3;

/**
 * Derived from state, never stored: the first name, or "LAST, First" when the formal greeting
 * is on and the last name is long enough. Raw, valid and invalid input are plain values in the
 * model, so no extra state is needed.
 */
export const greeting = ({ first, last, formal }: State): string =>
  formal && first.length > 0 && last.length >= MIN_LAST
    ? `${last.toUpperCase()}, ${first}`
    : first.trim();

export const Hello = define<State, Msg>()('gy-hello', {
  init: () => ({ first: '', last: '', formal: false }),
  intent: {
    // Text inputs fire on `input` and give `value`; checkboxes fire on `change` and give
    // `checked` (ADR 0001).
    First: ({ value }) => ({ _tag: 'First', value: value ?? '' }),
    Last: ({ value }) => ({ _tag: 'Last', value: value ?? '' }),
    Formal: ({ checked }) => ({ _tag: 'Formal', on: checked === true }),
  },
  update: {
    First: (s, m) => ({ ...s, first: m.value }),
    Last: (s, m) => ({ ...s, last: m.value }),
    Formal: (s, m) => ({ ...s, formal: m.on }),
  },
  view: (s, i) => html`
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
      <small id="last-hint">At least ${MIN_LAST} letters for the formal greeting.</small>
    </p>
    <p>
      <input id="formal" type="checkbox" ?checked=${s.formal} data-intent=${i.Formal} />
      <label for="formal">Formal greeting</label>
    </p>
    <hr />
    <output for="first last formal" aria-live="polite">Hello ${greeting(s)}</output>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
        --accent: oklch(55% 0.18 300);
      }
      p {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
      }
      input[type='text'] {
        font: inherit;
        padding-block: 0.4rem;
        padding-inline: 0.75rem;
        border: 1px solid color-mix(in oklch, currentColor 40%, transparent);
        border-radius: 0.5rem;
        background: transparent;
        color: inherit;
      }
      input[type='checkbox'] {
        inline-size: 1.25rem;
        block-size: 1.25rem;
      }
      @supports (accent-color: var(--accent)) {
        input[type='checkbox'] {
          accent-color: var(--accent);
        }
      }
      input:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      small {
        color: color-mix(in oklch, currentColor 65%, transparent);
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
      }
      @supports (text-wrap: balance) {
        output {
          text-wrap: balance;
        }
      }
    }
  `,
});
