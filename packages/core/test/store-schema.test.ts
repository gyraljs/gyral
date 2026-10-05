import { afterEach, describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { defineStore, StoreRegistry } from '../src/index.js';

interface Cart {
  readonly lines: readonly { readonly sku: string; readonly qty: number }[];
}
type CartMsg = { readonly _tag: 'Clear' };

const CartSchema = v.object({
  lines: v.array(v.object({ sku: v.string(), qty: v.pipe(v.number(), v.integer()) })),
});

const cart = defineStore<Cart, CartMsg>('schema-cart', {
  init: () => ({ lines: [] }),
  update: { Clear: () => ({ lines: [] }) },
  schema: CartSchema,
});

const loose = defineStore<Cart, CartMsg>('loose-cart', {
  init: () => ({ lines: [] }),
  update: { Clear: () => ({ lines: [] }) },
});

let errors: string[] = [];
const original = console.error;
const captureErrors = () => {
  errors = [];
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  };
};

afterEach(() => {
  console.error = original;
});

describe('store seed schemas (gyral-czi.29)', () => {
  it('uses a seed that passes the schema', () => {
    const seed = { lines: [{ sku: 'a', qty: 2 }] };
    const instance = new StoreRegistry([], { 'schema-cart': seed }).get(cart);
    expect(instance.state).toEqual(seed);
  });

  it('reports an invalid seed loudly, with paths, and starts from init', () => {
    captureErrors();
    const bad = { lines: [{ sku: 'a', qty: 'two' }] };
    const instance = new StoreRegistry([], { 'schema-cart': bad }).get(cart);
    expect(instance.state).toEqual({ lines: [] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('store "schema-cart"');
    expect(errors[0]).toContain('lines.0.qty');
  });

  it('trusts seeds of stores without a schema', () => {
    const anything = { lines: 'not even an array' };
    const instance = new StoreRegistry([], { 'loose-cart': anything }).get(loose);
    expect(instance.state).toEqual(anything);
  });

  it('exposes the check for tools and tests', () => {
    expect(cart.checkSeed({ lines: [] })).toEqual({ ok: true, state: { lines: [] } });
    expect(cart.checkSeed(null).ok).toBe(false);
  });
});
