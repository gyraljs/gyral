// Subscription inputs compare as data (ADR 0025, gyral-1zd.29): functions inside an input are
// ignored, so an inline selector, a new arrow function after every message, doesn't restart its
// lane; changed data or a changed key does. Inputs that can't be JSON (a self-referring store)
// still compare.
import { afterEach, describe, expect, it } from 'vitest';
import { command, define, html, settled, subscription } from '../src/index.js';

let value = 0;
let starts = 0;
const listeners = new Set<() => void>();
const set = (next: number): void => {
  value = next;
  for (const listener of [...listeners]) listener();
};

interface Pick {
  readonly channel: string;
  readonly pick: (n: number) => number;
  readonly store: object;
}
const selectorFeed = subscription<number, Pick>('select-feed', (emit, { input }) => {
  starts += 1;
  const listener = (): void => {
    emit(input.pick(value));
  };
  listeners.add(listener);
  return () => listeners.delete(listener);
});

type Msg =
  | { readonly _tag: 'Count'; readonly n: number }
  | { readonly _tag: 'Channel'; readonly name: string }
  | { readonly _tag: 'Noise' };
interface State {
  readonly n: number;
  readonly channel: string;
}

const store: { self?: unknown } = {}; // refers to itself, like a registry: no JSON text
store.self = store;

const Selecting = define<State, Msg>()('test-subs-selector', {
  init: () => ({ n: -1, channel: 'inbox' }),
  subscriptions: (s) => [
    command(
      selectorFeed,
      { channel: 'inbox', pick: (n: number) => n * 2, store },
      { onSuccess: (n): Msg => ({ _tag: 'Count', n }), key: `select-${s.channel}` },
    ),
  ],
  update: {
    Count: (s, m) => ({ ...s, n: m.n }),
    Channel: (s, m) => ({ ...s, channel: m.name }),
    Noise: (s) => ({ ...s }),
  },
  view: (s) => html`<output>${s.n}</output>`,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('subscription inputs', () => {
  it('a fresh inline selector does not restart the lane; a new key does', async () => {
    const el = new Selecting();
    document.body.append(el);
    await settled();
    const before = starts;
    set(3); // the lane emits; the next derive builds a new arrow function
    set(4);
    el.send({ _tag: 'Noise' });
    await settled();
    expect(starts).toBe(before);
    expect(el.shadowRoot?.querySelector('output')?.textContent).toBe('8');
    el.send({ _tag: 'Channel', name: 'alerts' }); // the key changes: the lane restarts
    await settled();
    expect(starts).toBe(before + 1);
  });
});
