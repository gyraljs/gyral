import { describe, expect, it } from 'vitest';
import { compareSummaries } from '../lib/smoke.mjs';

const host = (tag, children, shadow = true) => ({ tag, shadow, children });

describe('compareSummaries', () => {
  it('accepts a page that hydrated in place', () => {
    const s = { h1: 1, hosts: [host('x-app', 2), host('x-item', 1, false)] };
    expect(compareSummaries('/', s, s, [])).toEqual([]);
  });

  it('reports a duplicated shadow view, a doubled heading and page errors', () => {
    const server = { h1: 1, hosts: [host('x-app', 2)] };
    const live = { h1: 2, hosts: [host('x-app', 4)] };
    const problems = compareSummaries('/cart', server, live, ['Hydration value mismatch']);
    expect(problems).toHaveLength(3);
    expect(problems.join('\n')).toContain('duplicated or lost view');
    expect(problems.join('\n')).toContain('2 <h1>');
    expect(problems[0]).toContain('page error');
  });

  it('ignores hosts that the client added or removed', () => {
    const server = { h1: 1, hosts: [host('x-app', 2)] };
    const live = { h1: 1, hosts: [host('x-other', 9), host('x-app', 2)] };
    expect(compareSummaries('/', server, live, [])).toEqual([]);
  });
});
