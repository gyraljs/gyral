import { describe, expect, it } from 'vitest';
import { routes, type Matcher } from '../src/index.js';

const table = {
  home: '/',
  users: '/users',
  user: '/users/:id',
  post: '/users/:id/posts/:postId',
} as const;

const cases: [string, unknown][] = [
  ['/', { name: 'home', params: {}, path: '/' }],
  ['https://example.com/users', { name: 'users', params: {}, path: '/users' }],
  ['/users/', { name: 'users', params: {}, path: '/users' }],
  ['/users/7', { name: 'user', params: { id: '7' }, path: '/users/7' }],
  ['/users/7/?tab=a#top', { name: 'user', params: { id: '7' }, path: '/users/7' }],
  ['/users/J%C3%BCrgen', { name: 'user', params: { id: 'Jürgen' }, path: '/users/J%C3%BCrgen' }],
  ['/users/j%c3%bcrgen', { name: 'user', params: { id: 'jürgen' }, path: '/users/j%C3%BCrgen' }],
  ['/users/a@b', { name: 'user', params: { id: 'a@b' }, path: '/users/a%40b' }],
  [
    '/users/7/posts/42',
    { name: 'post', params: { id: '7', postId: '42' }, path: '/users/7/posts/42' },
  ],
  ['/users/7/posts', undefined],
  ['/nope', undefined],
  // Empty segments are never skipped, and a param is never empty.
  ['/users//7', undefined],
  ['//users/7', undefined],
  ['/users//', undefined],
  ['/users/7//', undefined],
  ['//', { name: 'home', params: {}, path: '/' }],
];

describe.each<Matcher>(['urlpattern', 'fallback'])('routes() with the %s matcher', (matcher) => {
  const app = routes(table, { matcher });

  it.each(cases)('matches %s', (url, expected) => {
    expect(app.match(url)).toEqual(expected);
  });

  it('types params by route name', () => {
    const m = app.match('/users/3/posts/9');
    if (m?.name !== 'post') throw new Error('expected post');
    const { id, postId } = m.params;
    expect([id, postId]).toEqual(['3', '9']);
  });
});

describe('routes() table rules', () => {
  it('builds encoded hrefs', () => {
    const app = routes(table);
    expect(app.href('post', { id: 'a b', postId: '1' })).toBe('/users/a%20b/posts/1');
    expect(app.href('home', {})).toBe('/');
  });

  it('rejects pattern syntax only URLPattern understands', () => {
    expect(() => routes({ any: '/files/*' })).toThrow(/literal and :param/);
    expect(() => routes({ rel: 'users' })).toThrow(/must start with "\/"/);
  });

  it.each([
    '/users//:id', // empty segment
    '/users/./x', // dot segments
    '/users/%2e%2e',
    '/v:id', // URLPattern reads a param inside the segment
    '/:post-id', // URLPattern reads the param `post`, then the literal `-id`
    '/:a/:a', // a param named twice
    '/a#b',
  ])('rejects %s, which the two matchers would read differently', (pattern) => {
    expect(() => routes({ bad: pattern })).toThrow(/literal and :param/);
  });

  it('canonicalizes literal segments as URLs spell them', () => {
    const app = routes({ cafe: '/café/:id', trail: '/a b/' });
    expect(app.href('cafe', { id: 'x' })).toBe('/caf%C3%A9/x');
    expect(app.match('/café/x')).toEqual({
      name: 'cafe',
      params: { id: 'x' },
      path: '/caf%C3%A9/x',
    });
    expect(app.match('/a%20b/')?.path).toBe('/a%20b');
  });

  it('reads a string starting with // as a path, not a host', () => {
    const app = routes({ user: '/users/:id' });
    expect(app.match('//users/7')).toBeUndefined();
    expect(app.match(new URL('https://example.com//users/7'))).toBeUndefined();
  });

  it('gives the canonical path a server redirects to', () => {
    const app = routes(table);
    const url = new URL('https://example.com/users/7/?tab=a');
    const m = app.match(url);
    const to = m !== undefined && m.path !== url.pathname ? m.path + url.search : undefined;
    expect(to).toBe('/users/7?tab=a');
  });

  it('matches in table order', () => {
    const app = routes({ me: '/users/me', user: '/users/:id' });
    expect(app.match('/users/me')?.name).toBe('me');
  });
});
