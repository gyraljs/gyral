import type { Head } from '@gyral/core';
import { routes } from '@gyral/router';

// One route table for the server (status, title) and the client (which page to show).
export const site = routes({ home: '/', about: '/about' });

/**
 * How each route renders in production (gyral-4k7.3): `home` is generated at build time,
 * `about` per request, to show both modes with one route table and one renderer.
 */
export const modes = { home: 'ssg', about: 'ssr' } as const satisfies Record<
  keyof typeof titles,
  'ssg' | 'ssr' | 'csr'
>;

/** Paths of every `ssg` route, for the prerender step. */
export const staticPaths = (): string[] =>
  (Object.keys(modes) as (keyof typeof modes)[])
    .filter((name) => modes[name] === 'ssg')
    .map((name) => site.href(name, {}));

export const titles = {
  home: 'The homepage',
  about: 'Read more about us',
} as const;

/**
 * The site's public origin, for canonical URLs. Configuration, never the request's Host header,
 * which a client or proxy can set (ADR 0019).
 */
export const ORIGIN = 'https://iso.example';

/**
 * The page's head for a path: the server's `renderPage()` and the client's `setHead()` both
 * call it, so a client navigation leaves the same head as a page load (ADR 0019).
 */
export const pageHead = (path: string): Head => {
  const match = site.match(path);
  return {
    title: `${match === undefined ? 'Page not found' : titles[match.name]} — Gyral isomorphic`,
    description: 'A Gyral app rendered on the server and hydrated in the browser.',
    ...(match === undefined
      ? { robots: 'noindex' }
      : { canonical: new URL(match.path, ORIGIN).href }),
  };
};
