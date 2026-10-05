import fc from 'fast-check';
import { toJsonSchema } from '@valibot/to-json-schema';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { arbitraryFrom, arbitraryFromJsonSchema } from '../src/arbitraries.js';

const runs = { numRuns: 200 };

describe('arbitraryFrom (Zod 4, Standard JSON Schema)', () => {
  const Signup = z.object({
    email: z.email(),
    age: z.number().int().min(18).max(120),
    plan: z.enum(['free', 'pro']),
    tags: z.array(z.string().min(1).max(8)).max(3),
    nickname: z.string().min(2).optional(),
    referrer: z.string().nullable(),
  });

  it('generates only values the schema accepts', () => {
    fc.assert(
      fc.property(arbitraryFrom(Signup), (value) => Signup.safeParse(value).success),
      runs,
    );
  });

  it('covers optional keys both present and absent', () => {
    const samples = fc.sample(arbitraryFrom(Signup), 200);
    expect(samples.some((s) => 'nickname' in s)).toBe(true);
    expect(samples.some((s) => !('nickname' in s))).toBe(true);
  });

  it('keeps refinements JSON Schema cannot express, by filtering', () => {
    const Even = z
      .number()
      .int()
      .min(0)
      .max(100)
      .refine((n) => n % 2 === 0);
    fc.assert(
      fc.property(arbitraryFrom(Even), (n) => n % 2 === 0),
      runs,
    );
  });
});

describe('arbitraryFrom (Valibot via @valibot/to-json-schema)', () => {
  const Address = v.object({
    zip: v.pipe(v.string(), v.regex(/^\d{5}$/)),
    state: v.picklist(['CA', 'NY', 'TX']),
    line2: v.optional(v.string()),
  });

  it('needs a converter, with a message saying which', () => {
    expect(() => arbitraryFrom(Address)).toThrow(/toJsonSchema/);
  });

  it('generates valid values with the converter', () => {
    const arb = arbitraryFrom(Address, { toJsonSchema: (s) => toJsonSchema(s as never) });
    fc.assert(
      fc.property(arb, (value) => v.safeParse(Address, value).success),
      runs,
    );
  });
});

describe('arbitraryFromJsonSchema', () => {
  it('handles $defs references, unions and nested arrays', () => {
    const arb = arbitraryFromJsonSchema({
      $defs: { id: { type: 'integer', minimum: 1, maximum: 9 } },
      type: 'object',
      properties: {
        ids: { type: 'array', items: { $ref: '#/$defs/id' }, minItems: 1, maxItems: 3 },
        kind: { anyOf: [{ const: 'a' }, { type: 'null' }] },
      },
      required: ['ids', 'kind'],
    });
    fc.assert(
      fc.property(arb, (value) => {
        const { ids, kind } = value as { ids: number[]; kind: unknown };
        return (
          ids.length >= 1 && ids.every((n) => n >= 1 && n <= 9) && (kind === 'a' || kind === null)
        );
      }),
      runs,
    );
  });

  it('rejects keywords it does not understand, with a remedy', () => {
    expect(() => arbitraryFromJsonSchema({ type: 'bigint' })).toThrow(/unsupported type "bigint"/);
  });
});
