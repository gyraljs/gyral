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

export const pageTitle = (path: string): string => {
  const match = site.match(path);
  return `${match === undefined ? 'Page not found' : titles[match.name]} — Gyral isomorphic`;
};
