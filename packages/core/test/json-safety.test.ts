import { describe, expect, it } from 'vitest';
import { jsonHazard } from '../src/index.js';

class Point {
  constructor(readonly x: number) {}
}

describe('jsonHazard (gyral-4k7.5)', () => {
  it('accepts JSON-safe data, including undefined object properties', () => {
    expect(
      jsonHazard({ a: [1, 'b', null, true, { c: {} }], skip: undefined }, 's'),
    ).toBeUndefined();
    expect(jsonHazard(Object.create(null), 's')).toBeUndefined();
  });

  it('names the first value that would change, with its path', () => {
    expect(jsonHazard({ when: new Date(0) }, 'state')).toBe(
      'state.when is a Date (becomes a string)',
    );
    expect(jsonHazard({ ids: new Set([1]) }, 'state')).toBe(
      'state.ids is a Set (becomes a plain object)',
    );
    expect(jsonHazard({ p: new Point(1) }, 'state')).toBe(
      'state.p is a Point (becomes a plain object)',
    );
    expect(jsonHazard({ list: [1, undefined] }, 'state')).toBe(
      'state.list[1] is undefined (dropped, or null in an array)',
    );
    expect(jsonHazard({ n: Number.NaN }, 'state')).toBe('state.n is NaN (becomes null)');
    expect(jsonHazard({ n: 1n }, 'state')).toBe("state.n is a bigint (JSON can't encode it)");
    expect(jsonHazard({ f: () => 1 }, 'state')).toBe('state.f is a function (dropped)');
  });

  it('detects cycles but not shared references', () => {
    const shared = { a: 1 };
    expect(jsonHazard({ x: shared, y: shared }, 's')).toBeUndefined();
    const loop: Record<string, unknown> = {};
    loop['self'] = loop;
    expect(jsonHazard(loop, 's')).toBe('s.self is a circular reference');
  });
});
