import { css, define, html } from '@gyral/core';
import { listen, makeRouter, setTitle, type RouteLocation } from '@gyral/router';
import { pageTitle, site, titles } from './routes.js';

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
        <p><a href="mailto:hello@example.com">Contact us</a></p>`;
    case undefined:
      return html`<h1>Page not found</h1>
        <p>Unknown page <code>${path}</code>.</p>`;
  }
};

export const App = define<State, Msg, Props>('gy-iso-app', {
  props: { path: { type: String } },
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
    // pageTitle() also renders the server's <title>: one source for both (ADR 0009).
    Routed: (_s, m) => [{ path: m.location.pathname }, [setTitle(pageTitle(m.location.pathname))]],
  },
  view: (s) => html`
    <header>${menu(s.path)}</header>
    <main>${content(s.path)}</main>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
        --accent: oklch(55% 0.18 260);
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
