import {
  changed,
  css,
  define,
  each,
  html,
  intents,
  nothing,
  send,
  type Stateless,
} from '@gyral/core';
import { cart, count, money, totalCents, type Line, type Product } from './cart.js';

/** A cart line (pure: it reads only its item and the intent name passed through pick). */
export const PRODUCTS: readonly Product[] = [
  { sku: 'mug', name: 'Enamel mug', priceCents: 1400 },
  { sku: 'lamp', name: 'Desk lamp', priceCents: 4900 },
  { sku: 'socks', name: 'Wool socks', priceCents: 1800 },
];

const button = css`
  button {
    font: inherit;
    padding-block: 0.35rem;
    padding-inline: 0.8rem;
    border: 1px solid var(--accent, oklch(55% 0.16 250));
    border-radius: 0.4rem;
    background: oklch(from var(--accent, oklch(55% 0.16 250)) l c h / 0.1);
    color: inherit;
    cursor: pointer;
  }
`;

/** Header badge: reads the cart and briefly highlights after each change. */
export const CartBadge = define<{ readonly bumps: number }, never>('gy-cart-badge', {
  stores: [cart],
  init: () => ({ bumps: 0 }),
  intent: {},
  update: {
    StoreChanged: (s, m) => (changed(cart, m) === undefined ? s : { bumps: s.bumps + 1 }),
  },
  states: (s) => ({ bumped: s.bumps % 2 === 1 }),
  view: (_s, _i, { read }) =>
    html`<a href="#cart">Cart <output aria-live="polite">${count(read(cart))}</output></a>`,
  styles: css`
    @layer component {
      a {
        color: inherit;
      }
      output {
        display: inline-block;
        min-inline-size: 1.5em;
        padding-inline: 0.4em;
        border-radius: 1em;
        text-align: center;
        background: oklch(55% 0.16 250);
        color: white;
        transition: scale 0.2s;
      }
      @supports selector(:state(bumped)) {
        :host(:state(bumped)) output {
          scale: 1.15;
        }
      }
    }
  `,
});

type ListMsg = { readonly _tag: 'AddToCart'; readonly sku: string };

/** Product list: writes to the cart, never reads it. */
export const ProductList = define<Stateless, ListMsg>('gy-product-list', {
  stores: [cart],
  intent: { AddToCart: ({ value }) => (value ? { _tag: 'AddToCart', sku: value } : undefined) },
  update: {
    AddToCart: (s, { sku }) => {
      const product = PRODUCTS.find((p) => p.sku === sku);
      return product === undefined ? s : [s, [send(cart, { _tag: 'Add', product })]];
    },
  },
  view: (_s, i) => html`
    <ul>
      ${PRODUCTS.map(
        (p) =>
          html`<li>
            <span>${p.name}</span> <data value=${p.priceCents}>${money(p.priceCents)}</data>
            <button type="button" value=${p.sku} data-intent=${i.AddToCart}>Add to cart</button>
          </li>`,
      )}
    </ul>
  `,
  styles: [
    button,
    css`
      ul {
        list-style: none;
        padding: 0;
        display: grid;
        gap: 0.5rem;
      }
      li {
        display: flex;
        gap: 1rem;
        align-items: center;
      }
      span {
        flex: 1;
      }
    `,
  ],
});

type PanelMsg = { readonly _tag: 'RemoveLine'; readonly sku: string } | { readonly _tag: 'Empty' };

/** The panel's intent names as a module constant: rows stay pure without passing them in. */
const panel = intents<PanelMsg>();

const LineRow = (l: Line) =>
  html`<li>
    ${l.name} × ${l.qty}
    <button type="button" value=${l.sku} data-intent=${panel.RemoveLine}>Remove</button>
  </li>`;

/** Cart panel: reads and writes the cart. */
export const CartPanel = define<Stateless, PanelMsg>('gy-cart-panel', {
  stores: [cart],
  intent: {
    RemoveLine: ({ value }) => (value ? { _tag: 'RemoveLine', sku: value } : undefined),
    Empty: () => ({ _tag: 'Empty' }),
  },
  update: {
    RemoveLine: (s, { sku }) => [s, [send(cart, { _tag: 'Remove', sku })]],
    Empty: (s) => [s, [send(cart, { _tag: 'Clear' })]],
  },
  view: (_s, i, { read }) => {
    const c = read(cart);
    if (c.lines.length === 0) return html`<p>Your cart is empty.</p>`;
    return html`
      <ul>
        ${each(c.lines, (l) => l.sku, LineRow)}
      </ul>
      <p>Total: <output>${money(totalCents(c))}</output></p>
      ${
        c.lines.length > 0
          ? html`<button type="button" data-intent=${i.Empty}>Empty cart</button>`
          : nothing
      }
    `;
  },
  styles: [button],
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-cart-badge': InstanceType<typeof CartBadge>;
    'gy-product-list': InstanceType<typeof ProductList>;
    'gy-cart-panel': InstanceType<typeof CartPanel>;
  }
}
