import { afterEach, describe, expect, it } from 'vitest';
import { changed, define, defineStore, html, send, settled } from '@gyral/core';
import { run, sentTo, step, stepStore, testStore } from '../src/index.js';

interface Cart {
  readonly lines: readonly string[];
}
type CartMsg = { readonly _tag: 'Add'; readonly sku: string } | { readonly _tag: 'Clear' };

const cart = defineStore<Cart, CartMsg>('testing-cart', {
  init: () => ({ lines: [] }),
  update: {
    Add: (s, m) => ({ lines: [...s.lines, m.sku] }),
    Clear: () => ({ lines: [] }),
  },
});

type Msg = { readonly _tag: 'Buy'; readonly sku: string };
interface State {
  readonly bought: number;
  readonly seen: number;
}

const Buyer = define<State, Msg>('testing-buyer', {
  stores: [cart],
  init: () => ({ bought: 0, seen: 0 }),
  intent: {},
  update: {
    Buy: (s, m, { read }) => [
      { ...s, bought: read(cart).lines.length + 1 },
      [send(cart, { _tag: 'Add', sku: m.sku })],
    ],
    StoreChanged: (s, m) => {
      const change = changed(cart, m);
      return change === undefined ? s : { ...s, seen: change.state.lines.length };
    },
  },
  view: (s, _i, { read }) => html`<p>${s.bought}/${read(cart).lines.length}</p>`,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('store testing helpers', () => {
  it('stepStore runs a store reducer purely', () => {
    expect(stepStore(cart, { lines: ['a'] }, { _tag: 'Add', sku: 'b' }).state.lines).toEqual([
      'a',
      'b',
    ]);
  });

  it('step reads the given store instances and sentTo extracts writes', () => {
    const instance = testStore(cart, { lines: ['x', 'y'] });
    const { state, commands } = step(
      Buyer.spec,
      { bought: 0, seen: 0 },
      { _tag: 'Buy', sku: 'z' },
      {},
      [instance],
    );
    expect(state.bought).toBe(3);
    expect(sentTo(commands, cart)).toEqual([{ _tag: 'Add', sku: 'z' }]);
  });

  it('step explains a missing store instance', () => {
    expect(() => step(Buyer.spec, { bought: 0, seen: 0 }, { _tag: 'Buy', sku: 'z' })).toThrow(
      /pass an instance/,
    );
  });

  it('run passes StoreChanged to its optional reducer', () => {
    const { state } = run(
      Buyer.spec,
      [
        {
          _tag: 'StoreChanged',
          store: cart.name,
          state: { lines: ['a', 'b'] },
          prev: { lines: [] },
        },
      ],
      { stores: [testStore(cart)] },
    );
    expect(state.seen).toBe(2);
  });

  it('testStore instances plug into elements through el.stores', async () => {
    const instance = testStore(cart, { lines: ['a'] });
    const el = new Buyer();
    el.stores = { [cart.name]: instance };
    document.body.append(el);
    await settled();
    el.send({ _tag: 'Buy', sku: 'b' });
    await settled();
    expect(instance.state.lines).toEqual(['a', 'b']);
    expect(el.state.seen).toBe(2);
    expect(el.shadowRoot?.querySelector('p')?.textContent).toBe('2/2');
  });
});
