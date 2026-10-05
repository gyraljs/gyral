import { afterEach, describe, expect, it } from 'vitest';
import { define, defineStore, html, send, StoreRegistry } from '../src/index.js';

interface Log {
  readonly events: readonly string[];
}
type LogMsg = { readonly _tag: 'Track'; readonly event: string };

const log = defineStore<Log, LogMsg>('send-log', {
  init: () => ({ events: [] }),
  update: { Track: (s, m) => ({ events: [...s.events, m.event] }) },
});

interface Cart {
  readonly owner: string;
  readonly lines: readonly string[];
}
type CartMsg = { readonly _tag: 'Add'; readonly sku: string };

// A store that writes to another store: the add is tracked in the log store.
const cart = defineStore<Cart, CartMsg>('send-cart', {
  init: () => ({ owner: 'nobody', lines: [] }),
  update: {
    Add: (s, m) => [
      { ...s, lines: [...s.lines, m.sku] },
      [send(log, { _tag: 'Track', event: `add:${m.sku}` })],
    ],
  },
});

define<{ readonly x: number }, never>('send-owner', {
  stores: [cart],
  init: () => ({ x: 0 }),
  intent: {},
  update: {},
  view: (_s, _i, { read }) => html`<p>${read(cart).owner}:${read(cart).lines.length}</p>`,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('store-to-store send() (gyral-czi.20)', () => {
  it('delivers to the other store in the same scope', () => {
    const registry = new StoreRegistry();
    registry.get(cart).send({ _tag: 'Add', sku: 'a' } as never);
    expect(registry.get(cart).state).toEqual({ owner: 'nobody', lines: ['a'] });
    expect(registry.get(log).state).toEqual({ events: ['add:a'] });
  });

  it('keeps scopes apart', () => {
    const one = new StoreRegistry();
    const two = new StoreRegistry();
    one.get(cart).send({ _tag: 'Add', sku: 'x' } as never);
    expect(two.get(log).state).toEqual({ events: [] });
  });

  it('warns and drops the message when the instance is not in a scope', () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };
    try {
      cart.instance().send({ _tag: 'Add', sku: 'b' });
    } finally {
      console.warn = original;
    }
    expect(warnings[0]).toContain('sends to "send-log"');
  });
});

describe('server-rendered <gyral-stores> on the client (gyral-czi.20)', () => {
  const mount = async (provider: HTMLElement) => {
    document.body.append(provider);
    const el = provider.querySelector('send-owner') as HTMLElement & {
      updateComplete: Promise<boolean>;
    };
    await el.updateComplete;
    return el.shadowRoot?.querySelector('p')?.textContent;
  };

  it("restores a provider's stores from its data-gyral-stores seed", async () => {
    const provider = document.createElement('gyral-stores');
    provider.setAttribute(
      'data-gyral-stores',
      JSON.stringify({ 'send-cart': { owner: 'island', lines: ['a', 'b'] } }),
    );
    provider.append(document.createElement('send-owner'));
    expect(await mount(provider)).toBe('island:2');
  });

  it('lets the seed win over a fresh instance passed in .instances (hydration matches)', async () => {
    const provider = document.createElement('gyral-stores') as HTMLElement & {
      instances?: unknown[];
    };
    provider.instances = [cart.instance()];
    provider.setAttribute(
      'data-gyral-stores',
      JSON.stringify({ 'send-cart': { owner: 'server', lines: [] } }),
    );
    provider.append(document.createElement('send-owner'));
    expect(await mount(provider)).toBe('server:0');
  });
});
