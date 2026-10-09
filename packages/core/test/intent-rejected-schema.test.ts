import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { redirectedTo, type IntentRejected } from '../src/index.js';
import { intentRejectedSchema } from '../src/internal.js';

const validate = (value: unknown) => intentRejectedSchema['~standard'].validate(value);

describe('intentRejectedSchema', () => {
  it('accepts what formAction answers, with or without values', () => {
    const plain = { _tag: 'IntentRejected', intent: 'Login', issues: [{ path: '', message: 'x' }] };
    expect(validate(plain)).toEqual({ value: plain });
    const withValues = { ...plain, values: { email: 'a@b.co', tags: ['a', 'b'] } };
    expect(validate(withValues)).toEqual({ value: withValues });
  });

  it('rejects other shapes', () => {
    for (const bad of [
      null,
      'IntentRejected',
      { _tag: 'Other', intent: 'x', issues: [] },
      { _tag: 'IntentRejected', intent: 1, issues: [] },
      { _tag: 'IntentRejected', intent: 'x', issues: [{ path: 1, message: 'm' }] },
      { _tag: 'IntentRejected', intent: 'x', issues: [], values: { a: 1 } },
    ]) {
      expect(validate(bad)).toHaveProperty('issues');
    }
  });

  it('lets schemas with plain optional fields produce an IntentRejected', () => {
    // exactOptionalPropertyTypes: valibot's optional() yields `values?: X | undefined`.
    const Decoded = v.object({
      _tag: v.literal('IntentRejected'),
      intent: v.string(),
      issues: v.array(v.object({ path: v.string(), message: v.string() })),
      values: v.optional(v.record(v.string(), v.string())),
    });
    const decoded: IntentRejected = v.parse(Decoded, {
      _tag: 'IntentRejected',
      intent: 'x',
      issues: [],
    });
    expect(decoded.intent).toBe('x');
  });
});

describe('redirectedTo', () => {
  it('reads FormRedirected answers only', () => {
    expect(redirectedTo({ _tag: 'Redirected', location: '/a' })).toBe('/a');
    expect(redirectedTo({ _tag: 'Redirected' })).toBeUndefined();
    expect(redirectedTo('nope')).toBeUndefined();
  });
});
