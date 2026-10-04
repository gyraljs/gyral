import { describe, expect, it } from 'vitest';
import { routes, type Matcher } from '../src/index.js';

const table = {
  home: '/',
  users: '/users',
  user: '/users/:id',
  post: '/users/:id/posts/:postId',
} as const;

const cases: [string, unknown][] = [
  ['/', { name: 'home', params: {} }],
  ['https://example.com/users', { name: 'users', params: {} }],
  ['/users/', { name: 'users', params: {} }],
  ['/users/7', { name: 'user', params: { id: '7' } }],
  ['/users/7/?tab=a#top', { name: 'user', params: { id: '7' } }],
  ['/users/J%C3%BCrgen', { name: 'user', params: { id: 'Jürgen' } }],
  ['/users/7/posts/42', { name: 'post', params: { id: '7', postId: '42' } }],
  ['/users/7/posts', undefined],
  ['/nope', undefined],
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

  it('matches in table order', () => {
    const app = routes({ me: '/users/me', user: '/users/:id' });
    expect(app.match('/users/me')?.name).toBe('me');
  });
});
