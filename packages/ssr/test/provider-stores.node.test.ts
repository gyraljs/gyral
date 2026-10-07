import { describe, expect, it } from 'vitest';
import { define, defineStore, html } from '@gyral/core';
import { renderToString } from '../src/index.js';

interface Cart {
  readonly owner: string;
}
const cart = defineStore<Cart, { readonly _tag: 'Noop' }>('provider-cart', {
  init: () => ({ owner: 'nobody' }),
  update: { Noop: (s) => s },
});

define<{ readonly x: number }, never>('ssr-owner', {
  stores: [cart],
  init: () => ({ x: 0 }),
  intent: {},
  update: {},
  view: (_s, _i, { read }) => html`<p>${read(cart).owner}</p>`,
});

// A component whose shadow DOM contains a provider: scoping must cross the shadow boundary.
define<{ readonly x: number }, never>('ssr-island', {
  init: () => ({ x: 0 }),
  intent: {},
  update: {},
  view: () =>
    html`<gyral-stores .instances=${[cart.instance({ owner: 'shadow' })]}
      ><ssr-owner></ssr-owner
    ></gyral-stores>`,
});

const owners = (out: string): string[] =>
  [...out.matchAll(/<p>(?:<!--[^>]*-->)*([a-z]+)/g)].map((m) => m[1] ?? '');

const decode = (s: string) =>
  s
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');

describe('<gyral-stores> providers on the server (gyral-czi.20)', () => {
  it('scopes components inside a provider to its instances; others use the request scope', async () => {
    const out = await renderToString(
      html`<ssr-owner></ssr-owner>
        <gyral-stores .instances=${[cart.instance({ owner: 'island' })]}>
          <ssr-owner></ssr-owner>
        </gyral-stores>
        <ssr-owner></ssr-owner>`,
      { stores: [cart.instance({ owner: 'request' })] },
    );
    expect(owners(out)).toEqual(['request', 'island', 'request']);
  });

  it('seeds the provider with its instances, for the client to restore', async () => {
    const out = await renderToString(
      html`<gyral-stores .instances=${[cart.instance({ owner: 'island' })]}
        ><ssr-owner></ssr-owner
      ></gyral-stores>`,
      { stores: [] },
    );
    const attr = /<gyral-stores[^>]*data-gyral-stores="([^"]*)"/.exec(out)?.[1];
    expect(JSON.parse(decode(attr ?? 'null'))).toEqual({ 'provider-cart': { owner: 'island' } });
    expect(out).not.toContain('instances'); // the property binding itself writes nothing
  });

  it('writes no seed for a provider without instances; its stores start from init', async () => {
    const out = await renderToString(html`<gyral-stores><ssr-owner></ssr-owner></gyral-stores>`, {
      stores: [cart.instance({ owner: 'request' })],
    });
    expect(out).toMatch(/<gyral-stores>/);
    expect(owners(out)).toEqual(['nobody']);
  });

  it('uses the nearest provider when providers nest', async () => {
    const out = await renderToString(
      html`<gyral-stores .instances=${[cart.instance({ owner: 'outer' })]}>
        <ssr-owner></ssr-owner>
        <gyral-stores .instances=${[cart.instance({ owner: 'inner' })]}>
          <ssr-owner></ssr-owner>
        </gyral-stores>
      </gyral-stores>`,
      { stores: [] },
    );
    expect(owners(out)).toEqual(['outer', 'inner']);
  });

  it('finds a provider across a shadow boundary', async () => {
    const out = await renderToString(html`<ssr-island></ssr-island>`, { stores: [] });
    expect(owners(out)).toEqual(['shadow']);
  });
});
