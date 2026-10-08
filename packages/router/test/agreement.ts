// Both matchers agree (ADR 0009): the same table through URLPattern and the segment fallback,
// over a generated set of paths: trailing and doubled slashes, empty and dot segments, percent
// encodings in either case, characters URLs encode, and literal segments a URL spells
// differently from the pattern. Shared by the browser (Chromium) and Node test files, whose
// URLPattern implementations differ.
import { describe, expect, it } from 'vitest';
import { routes } from '../src/index.js';

const table = {
  home: '/',
  users: '/users',
  user: '/users/:id',
  post: '/users/:id/posts/:postId',
  cafe: '/café/:id',
  tilde: '/~me/:id/',
  spaced: '/a b',
} as const;

const pool = [
  '',
  'users',
  'Users',
  '7',
  'posts',
  'J%C3%BCrgen',
  'j%c3%bcrgen',
  'jürgen',
  'café',
  'caf%C3%A9',
  'caf%c3%a9',
  '~me',
  'a b',
  'a%20b',
  '%2F',
  '%7',
  '.',
  '..',
  '%2e',
  ':id',
  '{x}',
  'a|b',
];

/** Every path of up to three segments from `pool`, with each ending. */
function paths(): string[] {
  const out: string[] = [];
  const walk = (prefix: string[], depth: number): void => {
    const path = `/${prefix.join('/')}`;
    for (const end of ['', '/', '//', '?q=1', '/#top']) out.push(path + end);
    if (depth === 3) return;
    for (const segment of pool) walk([...prefix, segment], depth + 1);
  };
  walk([], 0);
  return out;
}

export function agreementSuite(): void {
  describe('the URLPattern and fallback matchers agree', () => {
    const viaPattern = routes(table, { matcher: 'urlpattern' });
    const viaFallback = routes(table, { matcher: 'fallback' });
    const all = paths();

    it(`on ${String(all.length)} generated paths`, { timeout: 60_000 }, () => {
      let matched = 0;
      const disagree: string[] = [];
      for (const path of all) {
        const a = viaPattern.match(path);
        const b = viaFallback.match(path);
        if (JSON.stringify(a) !== JSON.stringify(b)) disagree.push(path);
        if (a !== undefined) matched += 1;
      }
      expect(disagree).toEqual([]);
      expect(matched).toBeGreaterThan(100); // the set exercises matches, not only misses
    });

    it(
      'a match path is canonical: it matches the same route again, with the same params',
      { timeout: 60_000 },
      () => {
        for (const path of all) {
          const m = viaFallback.match(path);
          if (m === undefined) continue;
          expect(viaPattern.match(m.path)).toEqual(m);
          expect(viaFallback.match(m.path)).toEqual(m);
        }
      },
    );
  });
}
