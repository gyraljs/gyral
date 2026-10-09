import { css, define, html, prop } from '@gyral/core';
import { listen, makeRouter, setHead, type RouteLocation } from '@gyral/router';
import { pageHead, site, titles } from './routes.js';

export interface Props {
  /** The request path, set by the server. On the client the router takes over. */
  readonly path?: string;
}

export interface State {
  readonly path: string;
}

export type Msg = { readonly _tag: 'Routed'; readonly location: RouteLocation };

const menu = (path: string) => html`
  <nav aria-label="Site">
    <ul>
      ${(['home', 'about'] as const).map((name) => {
        const href = site.href(name, {});
        return html`<li>
          <a href=${href} aria-current=${href === path ? 'page' : 'false'}>${titles[name]}</a>
        </li>`;
      })}
    </ul>
  </nav>
`;

const content = (path: string) => {
  switch (site.match(path)?.name) {
    case 'home':
      return html`<h1>${titles.home}</h1>
        <p>Welcome to our spectacular web page with nothing special here.</p>`;
    case 'about':
      return html`<h1>${titles.about}</h1>
        <p>This is the page where we describe ourselves.</p>
        <gy-iso-contact></gy-iso-contact>`;
    case undefined:
      return html`<h1>Page not found</h1>
        <p>Unknown page <code>${path}</code>.</p>`;
  }
};

export const App = define<State, Msg, Props>()('gy-iso-app', {
  props: { path: prop.string() },
  // This app owns the whole page, so it opts in to capturing link clicks (ADR 0009).
  drivers: { router: makeRouter({ captureLinks: true }) },
  // Same on server and client. The server never runs commands; after hydration the client
  // runs init's listen(), which streams the current location and every navigation (ADR 0012).
  init: (props) => [
    { path: props.path ?? '/' },
    [listen((location) => ({ _tag: 'Routed', location }))],
  ],
  intent: {},
  update: {
    // pageHead() also renders the server's head: one source for both (ADR 0019). The first
    // Routed after hydration finds the server's head already matching and writes nothing.
    Routed: (_s, m) => [{ path: m.location.pathname }, [setHead(pageHead(m.location.pathname))]],
  },
  view: (s) => html`
    <header>${menu(s.path)}</header>
    <main>${content(s.path)}</main>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
        --accent: oklch(50% 0.18 260);
      }
      /* A lighter accent on dark backgrounds keeps links at AA contrast (found by ui:check). */
      @supports (color: light-dark(black, white)) {
        :host {
          --accent: light-dark(oklch(50% 0.18 260), oklch(78% 0.12 260));
        }
      }
      nav ul {
        display: flex;
        gap: 1rem;
        padding: 0;
        list-style: none;
      }
      a {
        color: var(--accent);
      }
      a[aria-current='page'] {
        font-weight: 700;
        text-decoration: none;
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-iso-app': InstanceType<typeof App>;
  }
}
