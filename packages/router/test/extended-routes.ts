import { describe, expect, expectTypeOf, it } from 'vitest';
import { routes, type Matcher, type Params } from '../src/index.js';

const table = {
  product: '/products/:id?',
  editor: '/users/:id?/edit',
  docs: '/docs/:path*',
  notFound: '/:path*',
} as const;
const cases: readonly (readonly [string, unknown])[] = [
  ['/products', { name: 'product', params: {}, path: '/products' }],
  ['/products/', { name: 'product', params: {}, path: '/products' }],
  ['/products/a%2Fb', { name: 'product', params: { id: 'a/b' }, path: '/products/a%2Fb' }],
  ['/users/edit', { name: 'editor', params: {}, path: '/users/edit' }],
  ['/users/7/edit', { name: 'editor', params: { id: '7' }, path: '/users/7/edit' }],
  ['/users/edit/edit', { name: 'editor', params: { id: 'edit' }, path: '/users/edit/edit' }],
  ['/docs', { name: 'docs', params: { path: [] }, path: '/docs' }],
  ['/docs/', { name: 'docs', params: { path: [] }, path: '/docs' }],
  ['/docs/a%2fb/x', { name: 'docs', params: { path: ['a/b', 'x'] }, path: '/docs/a%2Fb/x' }],
  ['/', { name: 'notFound', params: { path: [] }, path: '/' }],
  ['/other/path', { name: 'notFound', params: { path: ['other', 'path'] }, path: '/other/path' }],
  ['/docs//x', undefined],
  ['/docs//', undefined],
  ['//docs/x', undefined],
];

export function extendedRoutesSuite(): void {
  describe.each<Matcher>(['urlpattern', 'fallback'])('extended routes, %s', (matcher) => {
    const app = routes(table, { matcher });
    it.each(cases)('matches %s and round trips its canonical path', (url, expected) => {
      const match = app.match(url);
      expect(match).toEqual(expected);
      if (match !== undefined) expect(app.match(match.path)).toEqual(match);
    });
    it('builds optional and catch-all hrefs with honest inferred types', () => {
      expect(app.href('product', {})).toBe('/products');
      expect(app.href('editor', { id: 'a b' })).toBe('/users/a%20b/edit');
      expect(app.href('editor', {})).toBe('/users/edit');
      expect(app.href('docs', { path: [] })).toBe('/docs');
      expect(app.href('docs', { path: ['a/b', 'x y'] })).toBe('/docs/a%2Fb/x%20y');
      expectTypeOf<Params<'/products/:id?'>>().toExtend<{ readonly id?: string }>();
      expectTypeOf<Params<'/docs/:path*'>>().toExtend<{ readonly path: readonly string[] }>();
      const match = app.match('/docs/a');
      if (match?.name !== 'docs') throw new Error('Expected docs');
      expectTypeOf(match.params.path).toEqualTypeOf<readonly string[]>();
      const typeAssertions = (): void => {
        // @ts-expect-error -- a catch-all is an array, never a joined string
        app.href('docs', { path: 'a/b' });
        // @ts-expect-error -- a catch-all must be present, even when empty
        app.href('docs', {});
        // @ts-expect-error -- optional segment captures are strings
        app.href('product', { id: ['x'] });
      };
      expectTypeOf(typeAssertions).toBeFunction();
    });
    it('supports an entirely optional root and backtracks for required segments', () => {
      const optional = routes({ all: '/:first?/:second?' }, { matcher });
      expect(optional.match('/')).toEqual({ name: 'all', params: {}, path: '/' });
      expect(optional.href('all', {})).toBe('/');
      expect(() => optional.href('all', { second: 'x' })).toThrow(/ambiguous/);
      const required = routes({ all: '/:scope?/:id' }, { matcher });
      expect(required.match('/x')?.params).toEqual({ id: 'x' });
      expect(required.href('all', { id: 'x' })).toBe('/x');
    });
    it('rejects missing, empty, dot or wrongly shaped href values at runtime', () => {
      const unsafe = app.href.bind(app) as (name: string, params: object) => string;
      for (const params of [{}, { path: 'x' }, { path: [''] }, { path: ['.'] }, { path: ['..'] }]) {
        expect(() => unsafe('docs', params)).toThrow();
      }
      expect(() => unsafe('missing', {})).toThrow(/unknown route/);
      expect(() => unsafe('product', { id: [] })).toThrow();
      expect(() => unsafe('product', { id: '' })).toThrow();
    });
    it.each(['/:a*/x', '/:a?/:a', '/:a*/:a*', '/:a??', '/:a+', '/*', '//'])(
      'rejects %s',
      (pattern) => {
        expect(() => routes({ bad: pattern }, { matcher })).toThrow();
      },
    );
  });

  it('agrees across native and fallback on generated optional/catch-all paths', () => {
    const native = routes(table, { matcher: 'urlpattern' });
    const fallback = routes(table, { matcher: 'fallback' });
    const pool = ['', 'products', 'docs', 'users', 'edit', '7', '%2F', '%7', 'j%c3%bcrgen'];
    for (const a of pool)
      for (const b of pool)
        for (const c of pool) {
          const path = `/${a}/${b}/${c}`;
          expect(native.match(path)).toEqual(fallback.match(path));
        }
  });
}
