import { defineStore } from '@gyral/core';

export interface Product {
  readonly sku: string;
  readonly name: string;
  readonly priceCents: number;
}

export interface Line extends Product {
  readonly qty: number;
}

export interface Cart {
  readonly lines: readonly Line[];
}

export type CartMsg =
  | { readonly _tag: 'Add'; readonly product: Product }
  | { readonly _tag: 'Remove'; readonly sku: string }
  | { readonly _tag: 'Clear' };

export const count = (cart: Cart): number => cart.lines.reduce((n, l) => n + l.qty, 0);
export const totalCents = (cart: Cart): number =>
  cart.lines.reduce((sum, l) => sum + l.priceCents * l.qty, 0);
export const money = (cents: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

/** The shared cart: MVI without a view (ADR 0013). Components read it and send it messages. */
export const cart = defineStore<Cart, CartMsg>('cart', {
  init: () => ({ lines: [] }),
  update: {
    Add: (s, { product }) =>
      s.lines.some((l) => l.sku === product.sku)
        ? { lines: s.lines.map((l) => (l.sku === product.sku ? { ...l, qty: l.qty + 1 } : l)) }
        : { lines: [...s.lines, { ...product, qty: 1 }] },
    Remove: (s, { sku }) => ({ lines: s.lines.filter((l) => l.sku !== sku) }),
    Clear: () => ({ lines: [] }),
  },
});
