import { afterEach, describe, expect, it } from 'vitest';
import {
  changed,
  command,
  define,
  defineDriver,
  defineStore,
  html,
  resetDocumentStores,
  send,
  STORE_SEED_ATTRIBUTE,
  type AnyStoreInstance,
} from '../src/index.js';

interface Cart {
  readonly lines: readonly string[];
}
type CartMsg =
  | { readonly _tag: 'Add'; readonly sku: string }
  | { readonly _tag: 'Clear' }
  | { readonly _tag: 'Saved' };

const saved: string[] = [];
const persist = defineDriver<readonly string[], undefined>({
  name: 'persist',
  run: (lines) => {
    saved.push(lines.join(','));
    return undefined;
  },
});

const cart = defineStore<Cart, CartMsg>('test-cart', {
  init: () => ({ lines: [] }),
  update: {
    Add: (s, m) => {
      const lines = [...s.lines, m.sku];
      return [{ lines }, [command(persist, lines, { onSuccess: () => ({ _tag: 'Saved' }) })]];
    },
    Clear: () => ({ lines: [] }),
    Saved: (s) => s,
  },
});

// Two distant components: a badge that only reads, a button that only writes.
define<{ readonly changes: number }, never>('test-badge', {
  stores: [cart],
  init: () => ({ changes: 0 }),
  intent: {},
  update: {
    StoreChanged: (s, m) => (changed(cart, m) === undefined ? s : { changes: s.changes + 1 }),
  },
  view: (s, _i, { read }) =>
    html`<output>${read(cart).lines.length}</output> <span>${s.changes}</span>`,
});

type AddMsg = { readonly _tag: 'AddOne' };
define<{ readonly n: number }, AddMsg>('test-add', {
  stores: [cart],
  init: () => ({ n: 0 }),
  intent: { AddOne: () => ({ _tag: 'AddOne' }) },
  update: {
    AddOne: (s) => [{ n: s.n + 1 }, [send(cart, { _tag: 'Add', sku: `sku-${String(s.n)}` })]],
  },
  view: (_s, i) => html`<button data-intent=${i.AddOne}>add</button>`,
});

define<{ readonly x: number }, never>('test-undeclared', {
  init: () => ({ x: 0 }),
  intent: {},
  update: {},
  view: (_s, _i, { read }) => html`${read(cart).lines.length}`,
});

const settle = () => new Promise((r) => setTimeout(r, 0));
const text = (el: Element | null | undefined, sel: string) =>
  el?.shadowRoot?.querySelector(sel)?.textContent;

async function mountIn(container: HTMLElement, markup: string): Promise<void> {
  container.innerHTML = markup;
  document.body.append(container);
  for (const el of container.querySelectorAll('*')) {
    await (el as Partial<{ updateComplete: Promise<unknown> }>).updateComplete;
  }
}

afterEach(() => {
  document.body.replaceChildren();
  for (const s of document.head.querySelectorAll(`script[${STORE_SEED_ATTRIBUTE}]`)) s.remove();
  resetDocumentStores();
  saved.length = 0;
});

describe('store instances', () => {
  it('apply messages, notify subscribers, and run commands', async () => {
    const instance = cart.instance();
    const seen: number[] = [];
    instance.subscribe((state) => seen.push(state.lines.length));
    instance.send({ _tag: 'Add', sku: 'a' });
    instance.send({ _tag: 'Add', sku: 'b' });
    await settle();
    expect(instance.state.lines).toEqual(['a', 'b']);
    expect(seen).toEqual([1, 2]);
    expect(saved).toEqual(['a', 'a,b']);
    instance.dispose();
  });

  it('run init commands at once, but after hydration when seeded', async () => {
    const loads: string[] = [];
    const load = defineDriver<string, undefined>({
      name: 'load',
      run: (from) => {
        loads.push(from);
        return undefined;
      },
    });
    const saved = defineStore<{ readonly n: number }, { readonly _tag: 'Loaded' }>('test-saved', {
      init: () => [{ n: 0 }, [command(load, 'init', { onSuccess: () => ({ _tag: 'Loaded' }) })]],
      update: { Loaded: (s) => ({ n: s.n + 1 }) },
    });
    const fresh = saved.instance();
    const seeded = saved.instance({ n: 10 });
    await Promise.resolve();
    expect(seeded.state.n).toBe(10); // nothing ran yet: the hydrating renders come first
    await settle();
    await settle();
    expect(loads).toEqual(['init', 'init']);
    expect(fresh.state.n).toBe(1);
    expect(seeded.state.n).toBe(11);
  });

  it('are independent of each other', () => {
    const a = cart.instance();
    const b = cart.instance({ lines: ['seeded'] });
    a.send({ _tag: 'Add', sku: 'x' });
    expect(a.state.lines).toEqual(['x']);
    expect(b.state.lines).toEqual(['seeded']);
  });
});

describe('components and stores (ADR 0013)', () => {
  it('distant components read, write and re-render through the document default', async () => {
    await mountIn(
      document.createElement('div'),
      `<header><test-badge></test-badge></header>
      <main><section><test-add></test-add></section></main>`,
    );
    const add = document.querySelector('test-add');
    add?.shadowRoot?.querySelector('button')?.click();
    add?.shadowRoot?.querySelector('button')?.click();
    const badge = document.querySelector('test-badge') as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    await badge.updateComplete;
    expect(text(badge, 'output')).toBe('2');
    expect(text(badge, 'span')).toBe('2'); // StoreChanged reducer ran per change
  });

  it('scopes instances to the nearest <gyral-stores> provider', async () => {
    const left = cart.instance({ lines: ['l'] });
    const right = cart.instance({ lines: ['r1', 'r2'] });
    const root = document.createElement('div');
    root.innerHTML = '<gyral-stores></gyral-stores><gyral-stores></gyral-stores>';
    const [pl, pr] = [...root.querySelectorAll('gyral-stores')];
    if (pl === undefined || pr === undefined) throw new Error('no providers');
    // A provider takes preset instances through its `instances` property.
    Object.assign(pl, { instances: [left] });
    Object.assign(pr, { instances: [right] });
    pl.innerHTML = '<test-badge></test-badge><test-add></test-add>';
    pr.innerHTML = '<div><test-badge></test-badge></div>';
    document.body.append(root);
    for (const el of root.querySelectorAll('test-badge, test-add')) {
      await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    }
    const [bl, br] = [...root.querySelectorAll('test-badge')];
    expect(text(bl, 'output')).toBe('1');
    expect(text(br, 'output')).toBe('2');
    root.querySelector('test-add')?.shadowRoot?.querySelector('button')?.click();
    await (bl as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect(left.state.lines).toHaveLength(2);
    expect(right.state.lines).toHaveLength(2);
    expect(text(bl, 'output')).toBe('2');
  });

  it('prefers a per-element override (tests)', async () => {
    const mine = cart.instance({ lines: ['a', 'b', 'c'] });
    const badge = document.createElement('test-badge') as HTMLElement & {
      stores: Record<string, AnyStoreInstance>;
      updateComplete: Promise<unknown>;
    };
    badge.stores = { [cart.name]: mine };
    document.body.append(badge);
    await badge.updateComplete;
    expect(text(badge, 'output')).toBe('3');
  });

  it('restores the document default from the server page seed', async () => {
    const seed = document.createElement('script');
    seed.type = 'application/json';
    seed.setAttribute(STORE_SEED_ATTRIBUTE, '');
    seed.textContent = JSON.stringify({ [cart.name]: { lines: ['from-server'] } });
    document.head.append(seed);
    await mountIn(document.createElement('div'), '<test-badge></test-badge>');
    expect(text(document.querySelector('test-badge'), 'output')).toBe('1');
  });

  it('rejects reading a store the spec does not declare', () => {
    // render() directly (not via Lit's update) so the error surfaces synchronously.
    const el = document.createElement('test-undeclared') as unknown as { render(): unknown };
    expect(() => el.render()).toThrow(/without declaring it/);
  });
});
