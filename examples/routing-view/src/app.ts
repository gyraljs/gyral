import { css, define, html, nothing, type Head } from '@gyral/core';
import {
  back,
  listen,
  makeRouter,
  routes,
  setHead,
  type RouteLocation,
  type RouteMatch,
} from '@gyral/router';

/** The route table: pure, typed, and reusable on a server (ADR 0009). */
export const app = routes({ home: '/', about: '/about', contacts: '/contacts' });

type Route = RouteMatch<typeof app.table>;
type Name = Route['name'];

export interface State {
  /** `undefined` until the router delivers the current location. */
  readonly location: RouteLocation | undefined;
  readonly route: Route | undefined;
}

export type Msg =
  { readonly _tag: 'Routed'; readonly location: RouteLocation } | { readonly _tag: 'Back' };

interface Page {
  readonly title: string;
  readonly nav: string;
  readonly body: string;
}

const pages: Readonly<Record<Name, Page>> = {
  home: {
    nav: 'Home',
    title: 'Welcome to the routing example',
    body: 'Links below are plain anchors. The router captures same-origin clicks, updates history, and streams every location to this component as a message.',
  },
  about: {
    nav: 'About',
    title: 'About me',
    body: 'The current route is model state, derived from the location by matching it against a typed route table. The view is a pure function of that state.',
  },
  contacts: {
    nav: 'Contacts',
    title: 'Contact me',
    body: 'Try the browser back button, or the Back button below: both arrive here as the same Routed message.',
  },
};

const order: readonly Name[] = ['home', 'about', 'contacts'];

/**
 * The document head for a route: one pure function, so a server could reuse it (ADR 0019).
 * An unknown route is `noindex`; a known one names its canonical URL.
 */
export const pageHead = (route: Route | undefined, origin: string): Head => ({
  title: `${route === undefined ? 'Page not found' : pages[route.name].nav} — Gyral routing`,
  ...(route === undefined
    ? { robots: 'noindex' }
    : { canonical: new URL(route.path, origin).href }),
});

export const RoutingView = define<State, Msg>()('gy-routing-view', {
  // This app owns the whole page, so it opts in to capturing link clicks (ADR 0009).
  drivers: { router: makeRouter({ captureLinks: true }) },
  // One streaming command: the current location now, then every change (ADR 0009).
  init: () => [
    { location: undefined, route: undefined },
    [listen((location) => ({ _tag: 'Routed', location }))],
  ],
  intent: {
    Back: () => ({ _tag: 'Back' }),
  },
  update: {
    Routed: (_s, { location }) => {
      const route = app.match(location.href);
      // A client-only app: the page's own origin is the canonical one.
      return [{ location, route }, [setHead(pageHead(route, new URL(location.href).origin))]];
    },
    Back: (s) => [s, [back()]],
  },
  // Cross-fade between pages (an enhancement: skipped without support or with reduced motion).
  // The first location is not a page change, so it renders directly.
  viewTransition: (prev, next) =>
    prev.location !== undefined && prev.route?.name !== next.route?.name,
  view: (s, i) => {
    const page = s.route === undefined ? undefined : pages[s.route.name];
    return html`
      <header>
        <nav aria-label="Main">
          <ul>
            ${order.map(
              (name) =>
                html`<li>
                  <a
                    href=${app.href(name, {})}
                    aria-current=${s.route?.name === name ? 'page' : nothing}
                    >${pages[name].nav}</a
                  >
                </li>`,
            )}
          </ul>
        </nav>
      </header>
      <main>
        ${
          s.location === undefined
            ? nothing
            : page === undefined
              ? html`<h1>404 — page not found</h1>
                  <p>No route matches <code>${s.location.pathname}</code>.</p>`
              : html`<h1>${page.title}</h1>
                  <p>${page.body}</p>`
        }
        <p><button type="button" data-intent=${i.Back}>Back</button></p>
        <details>
          <summary>Location object</summary>
          <pre><code>${JSON.stringify(s.location, null, 2)}</code></pre>
        </details>
      </main>
    `;
  },
  styles: css`
    @layer component {
      :host {
        display: block;
        --accent: oklch(55% 0.18 300);
        --muted: oklch(92% 0.02 300);
      }
      @supports (color: light-dark(black, white)) {
        :host {
          --muted: light-dark(oklch(92% 0.02 300), oklch(30% 0.03 300));
        }
      }
      header {
        border-block-end: 1px solid var(--muted);
      }
      nav ul {
        display: flex;
        gap: 0.25rem;
        margin: 0;
        padding-block: 0.75rem;
        padding-inline: 1rem;
        list-style: none;
      }
      nav a {
        display: block;
        padding-block: 0.375rem;
        padding-inline: 0.75rem;
        border-radius: 0.5rem;
        color: inherit;
        text-decoration: none;
      }
      nav a:hover {
        background: var(--muted);
      }
      nav a[aria-current='page'] {
        background: var(--accent);
        color: white;
      }
      a:focus-visible,
      button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      main {
        max-inline-size: 40rem;
        margin-inline: auto;
        padding: 2rem 1rem;
      }
      @supports (text-wrap: balance) {
        h1 {
          text-wrap: balance;
        }
      }
      @supports (text-wrap: pretty) {
        p {
          text-wrap: pretty;
        }
      }
      button {
        font: inherit;
        padding-block: 0.375rem;
        padding-inline: 0.875rem;
        border: 1px solid var(--accent);
        border-radius: 0.5rem;
        background: oklch(from var(--accent) l c h / 0.1);
        color: inherit;
        cursor: pointer;
      }
      pre {
        overflow-x: auto;
        padding: 0.75rem;
        border-radius: 0.5rem;
        background: var(--muted);
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-routing-view': InstanceType<typeof RoutingView>;
  }
}
