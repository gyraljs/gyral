import { expect, it } from 'vitest';
import { html } from 'lit';
import { page, renderToString } from '@gyral/ssr';
import { cart } from '../src/cart.js';
import '../src/components.js';

it('server-renders store-reading components from the request cart, with a page seed', async () => {
  const instance = cart.instance({
    lines: [{ sku: 'lamp', name: 'Desk lamp', priceCents: 4900, qty: 2 }],
  });
  const out = await renderToString(
    page({
      title: 'Cart',
      body: html`<gy-cart-badge></gy-cart-badge><gy-cart-panel></gy-cart-panel>`,
      stores: [instance],
    }),
    { stores: [instance] },
  );
  expect(out).toMatch(/<output aria-live="polite">(<!--[^>]*-->)*2/);
  expect(out).toMatch(/Total: <output>(<!--[^>]*-->)*\$98\.00/);
  expect(out).toContain('<script type="application/json" data-gyral-stores>');
});
