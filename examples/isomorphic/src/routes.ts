import { routes } from '@gyral/router';

// One route table for the server (status, title) and the client (which page to show).
export const site = routes({ home: '/', about: '/about' });

export const titles = {
  home: 'The homepage',
  about: 'Read more about us',
} as const;

export const pageTitle = (path: string): string => {
  const match = site.match(path);
  return `${match === undefined ? 'Page not found' : titles[match.name]} — Gyral isomorphic`;
};
