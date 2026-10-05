import { define, html } from '@gyral/core';

// A light-DOM component on the About page, loaded lazily by the client entry (route-level code
// splitting, as the lit-web-apps skill recommends). Splitting puts Lit in a chunk shared by the
// entry and this one, which a bundler evaluates before the entry's own code, so the production
// smoke test (`pnpm smoke:prod`) exercises hydration without Lit's hydrate support having
// patched LitElement first (gyral-czi.41). It also nests a light child in a shadow parent.

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
