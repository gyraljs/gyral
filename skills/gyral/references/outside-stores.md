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

export const Counter = define<{ readonly n: number }, Msg>()('my-outside-counter', {
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
- `fail(error)` ends it with an error: `onFailure` gets it (through `toError` if given). Wrap
  the driver in `retry(driver, policy)` to subscribe again first (a socket that reconnects). A
  `subscribe` that throws fails the same way.
- Writes are plain commands (`addToCounter` above); the change comes back through the
  subscription, not through the write's `onSuccess`.
- `await settled()` doesn't wait for subscriptions to end (they don't), but it waits for values
  already on their way: a store that notifies in a microtask, a watcher that re-arms in one.
  No `await Promise.resolve()` loops in tests.
- Many values per frame (market data, sensors) into a non-trivial view: list the message in
  `renderOnFrame` (components.md).

## A store per page, provided by name

When each page (or test) creates its own store, build commands with a default that explains
what's missing, and provide the real driver above the components:

```ts
import { provideDrivers, subscription } from '@gyral/core';

interface Draft {
  readonly revision: number;
}
interface DraftStore {
  getState(): Draft;
  subscribe(listener: () => void): () => void;
}

/** Commands are built with this one; it fails with a clear error until a page provides one. */
export const unboundDraft = subscription<Draft>('draft', () => {
  throw new Error('No draft: call provideDraft(element, store) on an ancestor.');
});

export const provideDraft = (element: Element, store: DraftStore): (() => void) =>
  provideDrivers(element, {
    draft: subscription<Draft>('draft', (emit) => {
      emit(store.getState());
      return store.subscribe(() => {
        emit(store.getState());
      });
    }),
  });
```

## One feed, several components

A mail app shows the unread count in a header badge and again in its sidebar, both fed by
one live feed. Keep one source and let each component subscribe to it: the source runs once,
and each component's subscription is released when that component goes away.

```ts
import { command, define, html, subscription, type Command } from '@gyral/core';

interface Mailbox {
  readonly unread: number;
  readonly folders: readonly { readonly name: string; readonly unread: number }[];
}
/** The live feed (a WebSocket, server-sent events): one instance, whatever reads it. */
interface Feed {
  getState(): Mailbox;
  subscribe(listener: () => void): () => void;
}
declare const feed: Feed;

/** One driver for every reader; each command subscribes once more to the same feed. */
const mailbox = subscription<Mailbox>('mailbox', (emit) => {
  emit(feed.getState());
  return feed.subscribe(() => {
    emit(feed.getState());
  });
});

type Msg = { readonly _tag: 'Updated'; readonly mailbox: Mailbox };
const watchMailbox = (): Command<Msg> =>
  command(mailbox, undefined, { onSuccess: (m): Msg => ({ _tag: 'Updated', mailbox: m }) });

export const UnreadBadge = define<Mailbox, Msg>()('my-unread-badge', {
  init: () => [feed.getState(), [watchMailbox()]],
  intent: {},
  update: { Updated: (_s, m) => m.mailbox },
  view: (s) => html`<span class="badge" aria-label="Unread messages">${s.unread}</span>`,
});

export const Sidebar = define<Mailbox, Msg>()('my-sidebar', {
  init: () => [feed.getState(), [watchMailbox()]],
  intent: {},
  update: { Updated: (_s, m) => m.mailbox },
  view: (s) =>
    html`<nav aria-label="Folders">
      <ul>
        ${s.folders.map((f) => html`<li>${f.name} <span>${f.unread}</span></li>`)}
      </ul>
    </nav>`,
});
```

- Both components name the driver `mailbox`, so one `provideDrivers(ancestor, { mailbox: … })`
  (or `withDrivers(container, { mailbox: fakeDriver('mailbox') })` in a test) reaches both:
  provide it on an element that contains them, such as the page or the test's container ("A
  store per page, provided by name" above).
- Each component can keep only what it shows (pick it in `onSuccess`). A feed that emits many
  times a second (prices) should list its message in `renderOnFrame` (components.md), so each
  component renders at most once per frame.
- When Gyral owns the state (reducers decide it, not a feed), use a `defineStore` store
  instead: both components list it in `stores` and read it with `ctx.read` (composition.md).
- A source that must not be opened twice (one WebSocket for the page) opens on the first
  subscriber and closes after the last: keep the connection and a set of listeners in one
  module, and let `subscribe` add to the set and return the removal.

## TC39 signals (with `signal-polyfill`)

A `Watcher`'s notification may not read signals, so it re-arms and reads in a microtask:

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

// const cart = watchSignals('cart', () => ({ items: store.items.get(), total: store.total.get() }));
```

`read` should return plain data (a snapshot object), not the signals themselves.

## A WebSocket feed

```ts
import { command, retry, subscription, type Command } from '@gyral/core';

/** Text messages from `url` until the component goes away; reconnects twice on failure. */
export const feed = retry(
  subscription<string, string>('feed', (emit, { input: url, fail }) => {
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
  }),
  { times: 2, delayMs: 1000, backoff: 'exponential' },
);

export const listenTo = <M>(url: string, toMsg: (line: string) => M): Command<M> =>
  command(feed, url, { onSuccess: toMsg, key: `feed:${url}` });
```

Sending on the same socket: keep the connection in one module and give it a plain driver for
writes (`run: (text) => { socket.send(text); }`).

## Testing

- Use the real source: create the store in the test and provide it by name
  (`withDrivers(container, { draft: … })` from `@gyral/testing`, or `el.drivers`), change it,
  then `await settled()`.
- Or fake it: `fakeDriver('counter')` records the subscription; `emitNext(value)` pushes a
  value, and `calls[0].signal.aborted` shows it was released on disconnect or switch.
- A real removal releases the source one microtask later (ADR 0006): after
  `el.remove(); await Promise.resolve();`, `calls[0].signal.aborted` is `true` and the driver's
  `abort` listeners have run. A move (`appendChild`/`insertBefore` in one task) keeps the
  subscription; see "Moves and reconnects" below.

## Moves and reconnects

A keyed-list library or DOM code that reorders rows by removing and re-inserting them in one
task doesn't stop a component's subscription. A component removed for real and attached again
later gets the framework message `Connected { reconnect: true }`; re-issue its watches there.
It is never sent on the first connect or after a move.

```ts
import { command, define, html, subscription, type Command } from '@gyral/core';

declare const unread: { get(): number; subscribe(listener: () => void): () => void };
const unreadSource = subscription<number>('unread', (emit) => {
  emit(unread.get());
  return unread.subscribe(() => emit(unread.get()));
});

type Msg =
  | { readonly _tag: 'Count'; readonly n: number }
  | { readonly _tag: 'Connected'; readonly reconnect: true };
const watch = (): Command<Msg> =>
  command(unreadSource, undefined, { onSuccess: (n): Msg => ({ _tag: 'Count', n }) });

export const UnreadBadge = define<number, Msg>()('unread-badge', {
  init: () => [0, [watch()]],
  intent: {},
  update: {
    Count: (_n, m) => m.n,
    Connected: (n) => [n, [watch()]], // attached again after a real removal
  },
  view: (n) => html`<span>${n}</span>`,
});
```
