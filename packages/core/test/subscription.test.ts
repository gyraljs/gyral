// subscription() (ADR 0006 "Outside sources"): a streaming driver over a source Gyral doesn't
// own. Values become messages, the source is released on switch, disconnect and failure, and
// settled() waits for values already on their way.
import { afterEach, describe, expect, it } from 'vitest';
import {
  command,
  define,
  html,
  provideDrivers,
  settled,
  subscription,
  type Command,
} from '../src/index.js';
import { signalLike } from './signal-like.js';

/** A Redux-style store: `subscribe(listener)` returns an unsubscribe function. */
function miniStore(initial: number) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch: (by: number) => {
      state += by;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    listeners: () => listeners.size,
  };
}

const counter = miniStore(0);
const counterDriver = subscription<number>('counter', (emit) => {
  emit(counter.getState());
  return counter.subscribe(() => {
    emit(counter.getState());
  });
});

let failNext: ((error: unknown) => void) | undefined;
let subscribed = 0;
let released = 0;
/** Keyed by room; returns an `{ unsubscribe }` object, as RxJS and XState do. */
const room = subscription<string, string>(
  'room',
  (emit, { input, fail }) => {
    subscribed += 1;
    failNext = fail;
    emit(`joined ${input}`);
    return {
      unsubscribe: () => {
        released += 1;
      },
    };
  },
  { retry: { times: 1 } },
);

const broken = subscription<number>('broken', () => {
  throw new Error('no source');
});

type Msg =
  | { readonly _tag: 'Count'; readonly n: number }
  | { readonly _tag: 'Room'; readonly line: string }
  | { readonly _tag: 'Join'; readonly room: string }
  | { readonly _tag: 'Failed'; readonly why: string };
interface State {
  readonly n: number;
  readonly lines: readonly string[];
  readonly failed: string;
}

const join = (name: string): Command<Msg> =>
  command(room, name, {
    onSuccess: (line): Msg => ({ _tag: 'Room', line }),
    onFailure: (error): Msg => ({ _tag: 'Failed', why: String(error) }),
  });

const Probe = define<State, Msg>('test-subscription-probe', {
  init: () => [
    { n: -1, lines: [], failed: '' },
    [
      command(counterDriver, undefined, { onSuccess: (n): Msg => ({ _tag: 'Count', n }) }),
      command(broken, undefined, {
        onSuccess: (n): Msg => ({ _tag: 'Count', n }),
        onFailure: (error): Msg => ({ _tag: 'Failed', why: String(error) }),
      }),
    ],
  ],
  intent: {},
  update: {
    Count: (s, m) => ({ ...s, n: m.n }),
    Room: (s, m) => ({ ...s, lines: [...s.lines, m.line] }),
    Join: (s, m) => [s, [join(m.room)]],
    Failed: (s, m) => ({ ...s, failed: m.why }),
  },
  view: (s) => html`<output>${s.n}</output>`,
});

const tick = () => new Promise((r) => setTimeout(r, 0));

async function mount(parent: HTMLElement = document.body) {
  const el = new Probe();
  parent.append(el);
  await settled();
  return el;
}

afterEach(() => {
  document.body.replaceChildren();
  subscribed = 0;
  released = 0;
});

describe('subscription()', () => {
  it('turns the current value and every change into messages', async () => {
    const el = await mount();
    expect(el.shadowRoot?.querySelector('output')?.textContent).toBe(String(counter.getState()));
    counter.dispatch(2);
    counter.dispatch(3);
    await settled();
    expect(el.state.n).toBe(counter.getState());
  });

  it('unsubscribes when the component disconnects', async () => {
    const el = await mount();
    expect(counter.listeners()).toBe(1);
    el.remove();
    await tick();
    expect(counter.listeners()).toBe(0);
  });

  it('releases an { unsubscribe } source when the lane switches, and ignores it after', async () => {
    const el = await mount();
    el.send({ _tag: 'Join', room: 'a' });
    el.send({ _tag: 'Join', room: 'b' }); // same lane, 'switch': room a is left
    await settled();
    expect([subscribed, released]).toEqual([2, 1]);
    expect(el.state.lines).toEqual(['joined a', 'joined b']);
    el.remove();
    await tick();
    expect(released).toBe(2);
  });

  it('fail() releases the source and retries, then reaches onFailure', async () => {
    const el = await mount();
    el.send({ _tag: 'Join', room: 'c' });
    failNext?.('dropped'); // first failure: retried (retry.times = 1) from a timer
    await tick();
    await tick();
    expect([subscribed, released]).toEqual([2, 1]);
    failNext?.('dropped again');
    await tick();
    expect([subscribed, released]).toEqual([2, 2]);
    expect(el.state.failed).toBe('dropped again');
    expect(el.state.lines).toEqual(['joined c', 'joined c']);
  });

  it('a subscribe that throws reaches onFailure', async () => {
    const el = await mount();
    await tick();
    expect(el.state.failed).toBe('Error: no source');
  });

  it('is substituted by name, like any driver', async () => {
    const host = document.createElement('div');
    provideDrivers(host, {
      counter: subscription<number>('counter', (emit) => {
        emit(42);
        return () => undefined;
      }),
    });
    document.body.append(host);
    const el = await mount(host);
    expect(el.state.n).toBe(42);
  });
});

// The signals recipe (skills/gyral/references/outside-stores.md): notify, then re-arm and read in a
// microtask; settled() waits for values on their way.
const moves = signalLike(0, { batched: true });
const movesDriver = subscription<number>('moves', (emit, { signal }) => {
  const watcher = moves.watcher(() => {
    queueMicrotask(() => {
      if (signal.aborted) return;
      watcher.watch();
      emit(moves.get());
    });
  });
  emit(moves.get());
  return watcher.unwatch;
});

const Moves = define<{ readonly n: number }, { readonly _tag: 'Moved'; readonly n: number }>(
  'test-subscription-moves',
  {
    init: () => [
      { n: -1 },
      [command(movesDriver, undefined, { onSuccess: (n) => ({ _tag: 'Moved' as const, n }) })],
    ],
    intent: {},
    update: { Moved: (_s, m) => ({ n: m.n }) },
    view: (s) => html`<output>${s.n}</output>`,
  },
);

describe('subscription() over a signals store', () => {
  it('renders the latest value after settled() and unwatches on disconnect', async () => {
    const el = new Moves();
    document.body.append(el);
    await settled();
    moves.set(1);
    moves.set(2);
    await settled();
    expect(el.shadowRoot?.querySelector('output')?.textContent).toBe('2');
    expect(moves.watchers()).toBe(1);
    el.remove();
    await tick();
    expect(moves.watchers()).toBe(0);
  });
});
