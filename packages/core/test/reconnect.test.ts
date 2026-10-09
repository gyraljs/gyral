// Moves and reconnects (view/05-element.md "Lifecycle", gyral-dyn.33). Disconnecting stops a
// host's commands one microtask later: a move (disconnect and connect in one task) keeps them
// running and sends nothing; a host that stayed detached gets `Connected { reconnect: true }`
// when it is attached again, and never on its first connect.
import { afterEach, describe, expect, it } from 'vitest';
import { command, define, html, settled, subscription, type Command } from '../src/index.js';

/** A source with `subscribe(listener) → unsubscribe`, counting live listeners. */
function feed() {
  let value = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: number) => {
      value = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    listeners: () => listeners.size,
  };
}

const unread = feed();
const unreadDriver = subscription<number>('unread', (emit) => {
  emit(unread.get());
  return unread.subscribe(() => {
    emit(unread.get());
  });
});

type Msg =
  | { readonly _tag: 'Count'; readonly n: number }
  | { readonly _tag: 'Connected'; readonly reconnect: true };
interface State {
  readonly n: number;
  readonly reconnects: number;
}

const watch = (): Command<Msg> =>
  command(unreadDriver, undefined, { onSuccess: (n): Msg => ({ _tag: 'Count', n }) });

/** Re-issues its watch on Connected. */
const Badge = define<State, Msg>()('test-reconnect-badge', {
  init: () => [{ n: -1, reconnects: 0 }, [watch()]],
  intent: {},
  update: {
    Count: (s, m) => ({ ...s, n: m.n }),
    Connected: (s) => [{ ...s, reconnects: s.reconnects + 1 }, [watch()]],
  },
  view: (s) => html`<output>${s.n}</output>`,
});

/** No Connected reducer: a move keeps its watch; a real detach ends it. */
const Plain = define<State, Exclude<Msg, { _tag: 'Connected' }>>()('test-reconnect-plain', {
  init: () => [
    { n: -1, reconnects: 0 },
    [command(unreadDriver, undefined, { onSuccess: (n) => ({ _tag: 'Count' as const, n }) })],
  ],
  intent: {},
  update: { Count: (s, m) => ({ ...s, n: m.n }) },
  view: (s) => html`<output>${s.n}</output>`,
});

/** A parent rendering a Badge, for the nested case. */
const Panel = define<object, never>()('test-reconnect-panel', {
  init: () => ({}),
  intent: {},
  update: {},
  view: () => html`<test-reconnect-badge></test-reconnect-badge>`,
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const text = (el: Element) => el.shadowRoot?.querySelector('output')?.textContent;

afterEach(async () => {
  document.body.replaceChildren();
  await tick();
});

describe('moves and reconnects', () => {
  it('keeps a subscription running across an appendChild move, and sends no Connected', async () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    const el = new Badge();
    a.append(el);
    await settled();
    expect(unread.listeners()).toBe(1);
    b.append(el); // disconnect + connect in one task
    await tick();
    expect(unread.listeners()).toBe(1);
    unread.set(4);
    await settled();
    expect(el.state.n).toBe(4);
    expect(text(el)).toBe('4');
    expect(el.state.reconnects).toBe(0);
  });

  it('keeps it across a reorder that removes and re-inserts rows in one task', async () => {
    const list = document.createElement('ul');
    document.body.append(list);
    const rows = [new Plain(), new Plain(), new Plain()];
    for (const row of rows) list.append(row);
    await settled();
    expect(unread.listeners()).toBe(3);
    // What a keyed-list library does to reverse its rows: detach all, insert in the new order.
    for (const row of rows) row.remove();
    for (const row of rows.toReversed()) list.append(row);
    await tick();
    expect(unread.listeners()).toBe(3);
    unread.set(7);
    await settled();
    expect(rows.map((row) => row.state.n)).toEqual([7, 7, 7]);
  });

  it('stops the commands after a real removal (one microtask later)', async () => {
    const el = new Plain();
    document.body.append(el);
    await settled();
    expect(unread.listeners()).toBe(1);
    el.remove();
    expect(unread.listeners()).toBe(1); // stopping waits one microtask
    await Promise.resolve();
    expect(unread.listeners()).toBe(0);
  });

  it('sends Connected { reconnect: true } when a stopped host is attached again', async () => {
    const el = new Badge();
    document.body.append(el);
    await settled();
    expect(el.state.reconnects).toBe(0); // never on the first connect
    el.remove();
    await tick();
    expect(unread.listeners()).toBe(0);
    unread.set(9);
    document.body.append(el);
    await settled();
    expect(el.state.reconnects).toBe(1);
    expect(unread.listeners()).toBe(1); // the reducer re-issued the watch
    expect(el.state.n).toBe(9);
    expect(text(el)).toBe('9');
  });

  it('a host without a Connected reducer stays stopped after a real reattach', async () => {
    const el = new Plain();
    document.body.append(el);
    await settled();
    el.remove();
    await tick();
    document.body.append(el);
    await settled();
    expect(unread.listeners()).toBe(0);
  });

  it('keeps init commands of a host moved before its first render', async () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    const el = new Badge();
    a.append(el);
    b.append(el); // moved in the same task it was first connected
    await settled();
    expect(unread.listeners()).toBe(1);
    expect(el.state.reconnects).toBe(0);
    unread.set(2);
    await settled();
    expect(text(el)).toBe('2');
  });

  it('a nested component keeps its subscription when its parent moves', async () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    const panel = new Panel();
    a.append(panel);
    await settled();
    const badge = panel.shadowRoot?.querySelector('test-reconnect-badge') as InstanceType<
      typeof Badge
    >;
    expect(unread.listeners()).toBe(1);
    b.append(panel);
    await tick();
    expect(unread.listeners()).toBe(1);
    unread.set(5);
    await settled();
    expect(badge.state.n).toBe(5);
    expect(badge.state.reconnects).toBe(0);
  });

  it('a nested component gets Connected when its parent is reattached after a detach', async () => {
    const panel = new Panel();
    document.body.append(panel);
    await settled();
    const badge = panel.shadowRoot?.querySelector('test-reconnect-badge') as InstanceType<
      typeof Badge
    >;
    panel.remove();
    await tick();
    expect(unread.listeners()).toBe(0);
    document.body.append(panel);
    await settled();
    expect(badge.state.reconnects).toBe(1);
    expect(unread.listeners()).toBe(1);
  });
});
