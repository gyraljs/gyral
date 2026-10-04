import { afterEach, expect, it } from 'vitest';
import { resetDocumentStores } from '@gyral/core';
import { stepStore } from '@gyral/testing';
import { cart, count, totalCents } from '../src/cart.js';
import '../src/components.js';

type Updatable = HTMLElement & { updateComplete: Promise<unknown> };

afterEach(() => {
  document.body.replaceChildren();
  resetDocumentStores();
});

async function mountPage() {
  document.body.innerHTML = `<header><nav><gy-cart-badge></gy-cart-badge></nav></header>
    <main><gy-product-list></gy-product-list></main>
    <aside><gy-cart-panel></gy-cart-panel></aside>`;
  const els = [
    ...document.querySelectorAll<Updatable>('gy-cart-badge, gy-product-list, gy-cart-panel'),
  ];
  const settle = async () => {
    for (const el of els) await el.updateComplete;
  };
  await settle();
  const [badge, list, panel] = els;
  if (badge === undefined || list === undefined || panel === undefined) throw new Error('mount');
  const click = async (host: Element, selector: string) => {
    host.shadowRoot?.querySelector<HTMLButtonElement>(selector)?.click();
    await settle();
  };
  return { badge, list, panel, click };
}

const badgeCount = (badge: Element) => badge.shadowRoot?.querySelector('output')?.textContent;

it('the cart store is pure', () => {
  const product = { sku: 'mug', name: 'Mug', priceCents: 100 };
  const once = stepStore(cart, { lines: [] }, { _tag: 'Add', product }).state;
  const twice = stepStore(cart, once, { _tag: 'Add', product }).state;
  expect(count(twice)).toBe(2);
  expect(totalCents(twice)).toBe(200);
});

it('adding in the list updates the distant badge and panel', async () => {
  const { badge, list, panel, click } = await mountPage();
  expect(badgeCount(badge)).toBe('0');
  await click(list, 'button[value=mug]');
  await click(list, 'button[value=mug]');
  await click(list, 'button[value=lamp]');
  expect(badgeCount(badge)).toBe('3');
  expect(panel.shadowRoot?.querySelectorAll('li')).toHaveLength(2);
  expect(panel.shadowRoot?.querySelector('output')?.textContent).toBe('$77.00');
});

it('removing in the panel updates the badge', async () => {
  const { badge, list, panel, click } = await mountPage();
  await click(list, 'button[value=socks]');
  await click(panel, 'button[value=socks]');
  expect(badgeCount(badge)).toBe('0');
  expect(panel.shadowRoot?.textContent).toContain('Your cart is empty.');
});

it('exposes changes to CSS through the badge custom state', async () => {
  const { badge, list, click } = await mountPage();
  await click(list, 'button[value=mug]');
  expect(badge.matches(':state(bumped)')).toBe(true);
});
