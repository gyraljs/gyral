import { describe, expect, it } from 'vitest';
import { redirectedTo } from '../src/index.js';

describe('redirectedTo', () => {
  it('reads FormRedirected answers only', () => {
    expect(redirectedTo({ _tag: 'Redirected', location: '/a' })).toBe('/a');
    expect(redirectedTo({ _tag: 'Redirected' })).toBeUndefined();
    expect(redirectedTo('nope')).toBeUndefined();
    expect(redirectedTo(null)).toBeUndefined();
  });
});
