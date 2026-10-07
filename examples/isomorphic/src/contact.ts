import { define, html } from '@gyral/core';

// A light-DOM component on the About page, loaded lazily by the client entry (route-level code
// splitting). Splitting puts shared code in a chunk the bundler evaluates before the entry's own
// code, so the production smoke test (`pnpm smoke:prod`) checks that hydration doesn't depend on
// module order. It also nests a light child in a shadow parent.

export interface State {
  readonly revealed: boolean;
}

export type Msg = { readonly _tag: 'Reveal' };

export const ADDRESS = 'hello@example.com';

export const Contact = define<State, Msg>('gy-iso-contact', {
  shadow: false,
  init: () => ({ revealed: false }),
  intent: { Reveal: () => ({ _tag: 'Reveal' }) },
  update: { Reveal: () => ({ revealed: true }) },
  view: (s) =>
    html`<p>
      <a href=${`mailto:${ADDRESS}`}>Contact us</a>
      ${
        s.revealed
          ? html`<output>${ADDRESS}</output>`
          : html`<button type="button" data-intent="Reveal">Show address</button>`
      }
    </p>`,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-iso-contact': InstanceType<typeof Contact>;
  }
}
