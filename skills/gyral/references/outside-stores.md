# State Gyral doesn't own

Signals, Redux or Zustand stores, XState actors, WebSocket feeds: when the source of truth
lives outside Gyral, components reach it through drivers, like any other effect. Reading is a
**subscription** (a streaming driver that lives as long as the component); writing is a plain
command whose driver calls the source. State that only Gyral components use belongs in a
`defineStore` store instead (composition.md).

## `subscription(name, subscribe, options?)`

```ts
import { command, define, defineDriver, html, subscription, type Command } from '@gyral/core';

/** What a Redux-style store offers (Redux's own Store type fits as is). */
interface CounterStore {
  getState(): number;
  subscribe(listener: () => void): () => void;
  dispatch(action: { readonly type: 'added'; readonly by: number }): void;
}
declare const counterStore: CounterStore;

/** Reading: the current value now, then every change, until the component goes away. */
const counter = subscription<number>('counter', (emit) => {
  emit(counterStore.getState());
  return counterStore.subscribe(() => {
    emit(counterStore.getState());
  });
});

/** Writing: a plain driver. The change comes back through the subscription. */
const addToCounter = defineDriver<number, void>({
  name: 'counter-add',
  run: (by) => {
    counterStore.dispatch({ type: 'added', by });
  },
});

type Msg = { readonly _tag: 'Counted'; readonly n: number } | { readonly _tag: 'Add' };

const watchCounter = (): Command<Msg> =>
  command(counter, undefined, { onSuccess: (n): Msg => ({ _tag: 'Counted', n }) });
const add = (by: number): Command<Msg> =>
  command(addToCounter, by, { onSuccess: (): Msg | undefined => undefined });

export const Counter = define<{ readonly n: number }, Msg>('my-outside-counter', {
  init: () => [{ n: 0 }, [watchCounter()]],
  intent: { Add: () => ({ _tag: 'Add' }) },
  update: {
    Counted: (_s, m) => ({ n: m.n }),
    Add: (s) => [s, [add(1)]],
  },
  view: (s, i) => html`<button type="button" data-intent=${i.Add}>${s.n}</button>`,
});
```

- `subscribe(emit, { input, signal, fail })` starts listening, may `emit` the current value at
  once, and returns how to stop: a function or an object with `unsubscribe()` (RxJS, XState's
  `actor.subscribe(…)`).
- It returns a streaming driver (ADR 0006): each value goes through the command's `onSuccess`.
  The source is released automatically when the command is switched away, when the component
  disconnects, and after `fail(error)`; emits after that are ignored.
- Lane default `'switch'`: issuing the command again replaces the subscription. Give each
  input its own `key` when one component keeps several (one per chat room).
- `fail(error)` ends it with an error: `onFailure` gets it (through `toError` if given), after
  the driver's `retry`, which subscribes again (a socket that reconnects). A `subscribe` that
  throws fails the same way.
- Writes are plain commands (`addToCounter` above); the change comes back through the
  subscription, not through the write's `onSuccess`.
- `await settled()` doesn't wait for subscriptions to end (they don't), but it waits for values
  already on their way: a store that notifies in a microtask, a watcher that re-arms in one.
  No `await Promise.resolve()` loops in tests.
- Many values per frame (market data, sensors) into a non-trivial view: list the message in
  `renderOnFrame` (components.md).

## A store per page, provided by name

When each page (or test) creates its own store, build commands with a default that explains
what's missing, and provide the real driver above the components (sabacc.starwars.run's table
does this):

```ts
import { provideDrivers, subscription } from '@gyral/core';

interface Table {
  readonly moves: number;
}
interface TableStore {
  getState(): Table;
  subscribe(listener: () => void): () => void;
}

/** Commands are built with this one; it fails with a clear error until a page provides one. */
export const unboundTable = subscription<Table>('table', () => {
  throw new Error('No table: call provideTable(element, store) on an ancestor.');
});

export const provideTable = (element: Element, store: TableStore): (() => void) =>
  provideDrivers(element, {
    table: subscription<Table>('table', (emit) => {
      emit(store.getState());
      return store.subscribe(() => {
        emit(store.getState());
      });
    }),
  });
```

## TC39 signals (with `signal-polyfill`)

After the `watch()` in sabacc.starwars.run's table driver (credited, with permission). A
`Watcher`'s notification may not read signals, so it re-arms and reads in a microtask:

```text
import { Signal } from 'signal-polyfill';
import { subscription } from '@gyral/core';

/** Streams read() now and after every change to the signals it reads. */
export const watchSignals = <T>(name: string, read: () => T) =>
  subscription<T>(name, (emit, { signal }) => {
    const current = new Signal.Computed(read);
    const watcher = new Signal.subtle.Watcher(() => {
      queueMicrotask(() => {
        if (signal.aborted) return;
        watcher.watch(); // re-arm
        emit(current.get());
      });
    });
    watcher.watch(current);
    emit(current.get());
    return () => watcher.unwatch(current);
  });

// const table = watchSignals('table', () => ({ game: store.game.get(), log: store.log.get() }));
```

`read` should return plain data (a snapshot object), not the signals themselves.

## A WebSocket feed

```ts
import { command, subscription, type Command } from '@gyral/core';

/** Text messages from `url` until the component goes away; reconnects twice on failure. */
export const feed = subscription<string, string>(
  'feed',
  (emit, { input: url, fail }) => {
    const socket = new WebSocket(url);
    socket.addEventListener('message', (e: MessageEvent<unknown>) => {
      if (typeof e.data === 'string') emit(e.data);
    });
    socket.addEventListener('close', (e) => {
      if (!e.wasClean) fail(new Error(`${url} closed (${String(e.code)})`));
    });
    return () => {
      socket.close();
    };
  },
  { retry: { times: 2, delayMs: 1000, backoff: 'exponential' } },
);

export const listenTo = <M>(url: string, toMsg: (line: string) => M): Command<M> =>
  command(feed, url, { onSuccess: toMsg, key: `feed:${url}` });
```

Sending on the same socket: keep the connection in one module and give it a plain driver for
writes (`run: (text) => { socket.send(text); }`).

## Testing

- Use the real source: create the store in the test and provide it by name
  (`withDrivers(container, { table: … })` from `@gyral/testing`, or `el.drivers`), change it,
  then `await settled()`.
- Or fake it: `fakeDriver('counter')` records the subscription; `emitNext(value)` pushes a
  value, and `calls[0].signal.aborted` shows it was released on disconnect or switch.
- Disconnect releases the source synchronously (ADR 0006): right after `el.remove()`,
  `calls[0].signal.aborted` is `true` and the driver's `abort` listeners have run, so assert
  without yielding. Only cleanup the driver runs after an `await` needs one
  (`await Promise.resolve()`).
