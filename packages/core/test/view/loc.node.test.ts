// view/loc.ts (gyral-g1r.24): the call site in a stack trace, in each engine's format.
import { describe, expect, it } from 'vitest';
import { callSite } from '../../src/view/loc.js';

describe('callSite', () => {
  it('reads V8 stacks: named and anonymous frames, query strings and /@fs dropped', () => {
    const stack = [
      'Error',
      '    at html (http://localhost:5173/@fs/repo/core/src/view/template.ts?v=1:20:21)',
      '    at view (http://localhost:5173/@fs/repo/app/src/cart.ts?t=99:12:5)',
      '    at render (http://localhost:5173/x.js:1:1)',
    ].join('\n');
    expect(callSite(stack)).toBe('/repo/app/src/cart.ts:12:5');
    expect(callSite('Error\n    at html (/a.js:1:1)\n    at /src/b.ts:3:4')).toBe('/src/b.ts:3:4');
  });

  it('reads Firefox and Safari stacks, and file URLs', () => {
    expect(callSite('html@http://h/t.js:1:2\nview@http://h/src/c.ts:7:9\n')).toBe('/src/c.ts:7:9');
    expect(callSite('html@file:///a/t.js:1:2\n@file:///a/src/c.js:4:1')).toBe('/a/src/c.js:4:1');
  });

  it('gives up on stacks without a caller', () => {
    expect(callSite(undefined)).toBeUndefined();
    expect(callSite('Error\n    at html (/a.js:1:1)')).toBeUndefined();
  });
});
