# Effects and drivers

A **driver** performs one kind of side effect. A **command** is data: a driver, an input, and
pure mappers from the outcome to messages. Reducers return commands; Gyral runs them, cancels
them when the component disconnects, and applies concurrency per lane.

## Writing a driver

```ts
import { command, defineDriver, type Command } from '@gyral/core';

interface SaveInput {
  readonly key: string;
  readonly value: string;
}

/** localStorage as a driver: reducers stay pure, tests substitute it by name. */
export const storage = defineDriver<SaveInput, void, string>({
  name: 'storage',
  run: ({ key, value }) => {
    localStorage.setItem(key, value);
  },
  concurrency: 'queue', // ordered writes
  toError: (cause) => (cause instanceof Error ? cause.message : String(cause)),
});

// Nothing to report on success, so there is no onSuccess: only failures answer.
export const save = <M>(key: string, value: string, onFailure: (reason: string) => M): Command<M> =>
  command(storage, { key, value }, { onFailure });
```

`Driver<I, O, E>` fields: `name` (substitution key), `run(input, { signal, emit })` returning
`O` or a `Promise<O>`, optional default `concurrency`, and `toError` (turns a thrown value into
the typed error `E` that `onFailure` receives). A driver runs once per command; for retries,
wrap it (below). Without `onFailure`, a failure is reported to the error channel (G0041).
Without `onSuccess`, or when it returns `undefined`, no message is sent.

### Commands that answer nothing: `Command<never>`

`focus()`, an `outputs<O>()` emit, `navigate()` and `setHead()` return `Command<never>`: they produce no message,
and `never` fits any message type, so they go in a reducer's command list or a helper typed
`Command<Msg>` with no type argument. Your own fire-and-forget commands are the same: call
`command(driver, input)` with no handlers (or without `onSuccess`). A failure is still reported
(G0041). With handlers, the message type is inferred from them, literal tags included, so
`command<…>` type arguments are rarely needed:

```ts
import { command, defineDriver, focus, type Command } from '@gyral/core';
import { navigate } from '@gyral/router';

type Msg = { readonly _tag: 'Saved' } | { readonly _tag: 'Failed' };

/** After a save: back to the list, with focus on its heading. No `<M>` needed. */
export const afterSave = (): readonly Command<Msg>[] => [navigate('/items'), focus('h1')];

const log = defineDriver<string, undefined>({
  name: 'log',
  run: (line) => {
    console.info(line);
  },
});
/** Fire and forget: no handlers, no type arguments. */
export const audit = (line: string): Command<Msg> => command(log, line);
```

## Concurrency (per lane: `key`, default the driver name)

| Policy            | Behaviour                                | Use for                      |
| ----------------- | ---------------------------------------- | ---------------------------- |
| `merge` (default) | run all concurrently                     | independent writes, logging  |
| `switch`          | abort the in-flight one, run the new one | search as you type, debounce |
| `exhaust`         | drop new ones while one is in flight     | submit buttons, refresh      |
| `queue`           | one at a time, in order                  | ordered saves                |

Set per command (`{ key: 'search', concurrency: 'switch' }`) or as the driver's default.

## Retries: wrap the driver

`retry(driver, { times, delayMs?, backoff?, jitter?, retryIf? })` returns the same driver (same
name, so substitution still works) with failures retried after the delay; an abort (switched
away, disconnected) ends it at once and is never retried. Wrap where the driver is chosen: app
setup, a component's `drivers`, or a test fake. Apps that never call `retry` don't bundle it.

- `backoff: 'exponential'` doubles the delay each attempt; `jitter: true` waits a random part of
  it (full jitter), so many clients don't retry in lockstep.
- `retryIf(error)` gets the driver's typed error and decides; default: retry every failure. For
  HTTP use `retryableHttpError` from `@gyral/http`: network errors, timeouts, 408, 429 and 5xx
  (`Retry-After` isn't read).
- `makeHttpDriver({ timeoutMs })` aborts an attempt that takes longer, failing with
  `HttpTimeoutError`. Under `retry` each attempt gets the full time.

```ts
import { provideDrivers, retry } from '@gyral/core';
import { makeHttpDriver, retryableHttpError } from '@gyral/http';

provideDrivers(document.body, {
  http: retry(makeHttpDriver({ baseUrl: '/api', timeoutMs: 8000 }), {
    times: 3,
    delayMs: 300,
    backoff: 'exponential',
    jitter: true,
    retryIf: retryableHttpError,
  }),
});
```

## Streaming drivers

For Gyral-owned native EventSource/WebSocket connections, use the optional drivers in
network-streams.md. The lower-level contracts below remain useful for other transports.

`run` may call `ctx.emit(output)` many times (each goes through `onSuccess`) and usually never
resolves; `ctx.signal` aborts when the command is switched away or the component disconnects.
When a stream delivers many messages per frame (market data, sensors) and the view isn't
trivial, list the message in the spec's `renderOnFrame: ['Ticked']`: reducers still run per
message, but the component renders once per animation frame. Not for clicks or pointer moves.

```ts
import { command, defineDriver, type Command } from '@gyral/core';

/** Server-sent events: one message per event until the component goes away. */
export const events = defineDriver<string, string>({
  name: 'events',
  run: (url, { signal, emit }) =>
    new Promise<string>(() => {
      const source = new EventSource(url);
      source.onmessage = (e: MessageEvent<string>) => {
        emit(e.data);
      };
      signal.addEventListener('abort', () => {
        source.close();
      });
    }),
});

export const subscribe = <M>(url: string, toMsg: (data: string) => M): Command<M> =>
  command(events, url, { onSuccess: toMsg, key: `events:${url}`, concurrency: 'switch' });
```

### Sources Gyral doesn't own: `subscription()`

For signals, Redux/Zustand stores, XState actors or sockets, `subscription(name, (emit, {
input, signal, fail }) => unsubscribe, options?)` builds the streaming driver for you: it
emits until the command is switched away or the component disconnects, then calls the
returned unsubscribe (a function or `{ unsubscribe() }`). Recipes (TC39 signals, a
Redux-style store, a store provided per page, a WebSocket) and testing: outside-stores.md.

## Packages that ship drivers

```ts
import { define, html } from '@gyral/core';
import { request, type HttpError } from '@gyral/http';
import { listen, navigate, routes, setHead, type RouteLocation } from '@gyral/router';
import { delay, every } from '@gyral/time';

export const site = routes({ home: '/', product: '/products/:id' });

interface State {
  readonly path: string;
  readonly since: number | undefined;
  readonly seconds: number;
  readonly saved: boolean;
}
type Msg =
  | { readonly _tag: 'Routed'; readonly location: RouteLocation }
  | { readonly _tag: 'Tick'; readonly now: number }
  | { readonly _tag: 'Open'; readonly id: string }
  | { readonly _tag: 'Save' }
  | { readonly _tag: 'Saved' }
  | { readonly _tag: 'SaveFailed'; readonly error: HttpError }
  | { readonly _tag: 'HideToast' };

export const Shell = define<State, Msg>()('my-shell', {
  init: () => ({ path: '/', since: undefined, seconds: 0, saved: false }),
  // Long-lived work runs as subscriptions (ADR 0025): started after the first render, kept
  // running across moves, started again after a real removal.
  subscriptions: () => [
    listen((location) => ({ _tag: 'Routed', location })), // current URL, then every change
    every(1000, (now) => ({ _tag: 'Tick', now })), // the time now, then every second
  ],
  intent: {
    Open: ({ value }) => (value === undefined ? undefined : { _tag: 'Open', id: value }),
    Save: true,
  },
  update: {
    Routed: (s, m) => [
      { ...s, path: m.location.pathname },
      [setHead({ title: `Shop — ${m.location.pathname}` })],
    ],
    Tick: (s, m) => {
      const since = s.since ?? m.now;
      return { ...s, since, seconds: Math.round((m.now - since) / 1000) };
    },
    Open: (s, m) => [s, [navigate(site.href('product', { id: m.id }))]],
    Save: (s) => [
      s,
      [
        request(
          { url: '/api/save', method: 'POST', body: { at: s.seconds } },
          {
            onSuccess: (): Msg => ({ _tag: 'Saved' }),
            onFailure: (error): Msg => ({ _tag: 'SaveFailed', error }),
            key: 'save',
            concurrency: 'exhaust',
          },
        ),
      ],
    ],
    Saved: (s) => [{ ...s, saved: true }, [delay<Msg>(3000, { _tag: 'HideToast' })]],
    SaveFailed: (s) => s,
    HideToast: (s) => ({ ...s, saved: false }),
  },
  view: (s, i) => html`
    <p>${s.path} · ${s.seconds}s</p>
    <button type="button" value="42" data-intent=${i.Open}>Product 42</button>
    <button type="button" data-intent=${i.Save}>Save</button>
    ${s.saved ? html`<p role="status">Saved</p>` : ''}
  `,
});
```

- **`@gyral/http`**: `get(url, handlers)`, `request(req, handlers)` (`req`: method, headers,
  JSON or form `body`; `handlers`: `onSuccess`, `onFailure`, and `schema` / `errorSchema` with
  any Standard Schema library), `submitForm(url, formData, options)` for forms (see forms.md).
  Errors are a typed union: `HttpStatusError` (with `status`, `body`, `detail`),
  `HttpNetworkError`, `HttpDecodeError`, `HttpTimeoutError` (with `timeoutMs`).
  App-wide headers, and the one place a CSRF token from a `<meta>` is configured:
  `makeHttpDriver({ headers: csrfFromMeta('csrf-token') })`. Development builds warn once when
  a POST/PUT/PATCH/DELETE goes out without the token while the page has a CSRF `<meta>`.
- **`@gyral/time`**: `delay(ms, msg)`, `debounce(ms, msg, key?)` (a `switch` delay),
  `every(ms, (now) => msg, key?)` (the wall-clock time at once, then every `ms`; made for
  `subscriptions`). `delay` and `debounce` run on a delay-only driver (also named `time`), so
  an app that only delays doesn't bundle the `every` code. Animation frames are a recipe:
  `command(time, { _tag: 'Frames' }, { onSuccess, key: 'frames', concurrency: 'switch' })`.
- **`@gyral/router`**: `listen(toMsg)` from `subscriptions`, `navigate(url, { replace?, scroll?, focusReset? })`,
  `setHead(head)` (the page's head: see ssr.md "One head
  for server and client"), typed `routes({...})` tables with
  `match(url)` (`{ name, params, path }`; `path` is the canonical path, which servers redirect
  to: ssr.md "One URL per page") and `href(name, params)` (same table on server and client).
  Patterns are literal segments, `:param`, optional `:param?` and a trailing catch-all
  `:path*` (an array of segments); empty segments (`/a//b`) never match. Link clicks are
  captured only with `makeRouter({ captureLinks: true })` given as the `router` driver of the
  component that owns the page.

### Scroll and focus after a navigation

Once the new page has rendered (`settled()`), the browser router scrolls to the `#fragment`
target or the top (push), restores the position on back/forward, and resets focus to the first
`[autofocus]` element or the page start: the same on the Navigation API and the History API. A
`replace` leaves scroll and focus alone unless you pass `scroll: true` / `focusReset: true`, so
syncing the query with a search box never moves the page. Fragment targets must be in the document (a light-DOM page, `shadow: false`).
Opt out per navigation (`navigate(url, { scroll: false })`) or per router
(`makeRouter({ scroll: false, focusReset: false })`). For screen-reader and keyboard users,
move focus to the new page's heading; the router then leaves focus alone:

```ts
import { define, focus, html } from '@gyral/core';
import { listen, routes, type RouteLocation, type RouteMatch } from '@gyral/router';

const site = routes({ home: '/', product: '/products/:id' });

interface State {
  readonly route: RouteMatch<typeof site.table> | undefined;
}
type Msg = { readonly _tag: 'Routed'; readonly location: RouteLocation };

export const App = define<State, Msg>()('my-app', {
  shadow: false, // a page-level component: fragment targets are in the document
  init: () => ({ route: undefined }),
  subscriptions: () => [listen((location): Msg => ({ _tag: 'Routed', location }))],
  update: {
    // Not on the page load (seq 0); h1 needs tabindex="-1".
    Routed: (_s, m) => [
      { route: site.match(m.location.href) },
      m.location.seq > 0 ? [focus('main h1')] : [],
    ],
  },
  view: (s) => html`<main><h1 tabindex="-1">${s.route?.name ?? 'Not found'}</h1></main>`,
});
```

### Updating the query without moving the page

Filters, a search box or an open dialog often belong in the URL (`?q=shoes&sort=price`) so a
reload or a shared link restores them, but changing them must not scroll or move focus. Use
`navigate` with `replace` (no new history entry per keystroke), `scroll: false` and
`focusReset: false`. The router still sees the change, so `listen` delivers the new location
and state derived from `location.search` stays in step with the address bar; no extra driver
is needed:

```ts
import { define, html } from '@gyral/core';
import { listen, navigate, type RouteLocation } from '@gyral/router';

interface State {
  readonly q: string;
  readonly sort: string;
}
type Msg =
  | { readonly _tag: 'Routed'; readonly location: RouteLocation }
  | { readonly _tag: 'Filter'; readonly field: keyof State; readonly value: string };

const fromSearch = (search: string): State => {
  const params = new URLSearchParams(search);
  return { q: params.get('q') ?? '', sort: params.get('sort') ?? 'relevance' };
};

const toSearch = (s: State): string =>
  `?${new URLSearchParams({ q: s.q, sort: s.sort }).toString()}`;

export const Filters = define<State, Msg>()('search-filters', {
  init: () => fromSearch(''),
  // listen() delivers the current location first, so the query is read in one place.
  subscriptions: () => [listen((location): Msg => ({ _tag: 'Routed', location }))],
  intent: {
    Filter: (input) => ({
      _tag: 'Filter',
      field: input.target.getAttribute('name') === 'sort' ? 'sort' : 'q',
      value: input.value ?? '',
    }),
  },
  update: {
    Routed: (_s, m) => fromSearch(m.location.search),
    Filter: (s, m) => {
      const next = { ...s, [m.field]: m.value };
      return [next, [navigate(toSearch(next), { replace: true })]];
    },
  },
  view: (s, i) => html`
    <input type="search" name="q" value=${s.q} data-intent=${i.Filter} data-intent-on="input" />
    <select name="sort" data-intent=${i.Filter}>
      <option value="relevance" ?selected=${s.sort === 'relevance'}>Relevance</option>
      <option value="price" ?selected=${s.sort === 'price'}>Price</option>
    </select>
  `,
});
```

## Recipe: copying to the clipboard

A driver over `navigator.clipboard.writeText`, with a typed error:

```ts
import { command, defineDriver } from '@gyral/core';

export type CopyError = 'unavailable' | 'denied' | 'failed';

export const clipboard = defineDriver<string, unknown, CopyError>({
  name: 'clipboard',
  run: (text) => navigator.clipboard.writeText(text),
  toError: (e) =>
    e instanceof TypeError
      ? 'unavailable'
      : e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'denied'
        : 'failed',
});

export const copyText = <M>(text: string, done: M, failed: (e: CopyError) => M) =>
  command(clipboard, text, { onSuccess: () => done, onFailure: failed });
```

- `navigator.clipboard` exists only in a secure context (https://, or localhost); elsewhere
  reading `writeText` throws a `TypeError` (`unavailable`).
- Browsers write only during a user activation: return the command from the reducer of the
  click's message. With a synchronous parser it starts while the click is being handled.
  Otherwise the browser rejects with `NotAllowedError` (`denied`).
- Tests substitute it by name and never touch the real clipboard:
  `el.drivers = { clipboard: fakeDriver('clipboard') }`.

## Recipes: history traversal and randomness

These are a few lines each, so they are recipes rather than exports.

- **History back and forward**: the router driver takes a `Traverse` input.

  ```ts
  import { command } from '@gyral/core';
  import { router } from '@gyral/router';

  export const back = () => command(router, { _tag: 'Traverse', delta: -1 });
  export const forward = () => command(router, { _tag: 'Traverse', delta: 1 });
  ```

- **Randomness** is an effect, so reducers stay deterministic and tests substitute the driver
  by name (`fakeDriver(randomDriver, { impl: () => [0.25] })`):

  ```ts
  import { command, defineDriver, type Command } from '@gyral/core';

  export const randomDriver = defineDriver({
    name: 'random',
    run: ({ count }: { readonly count: number }): readonly number[] =>
      Array.from({ length: count }, () => Math.random()),
  });

  /** A random integer in [min, max], delivered as a message. */
  export function randomInt<M>(min: number, max: number, toMsg: (n: number) => M): Command<M> {
    return command(
      randomDriver,
      { count: 1 },
      { onSuccess: ([u = 0]) => toMsg(min + Math.min(max - min, Math.floor(u * (max - min + 1)))) },
    );
  }
  ```

## Substituting drivers (by name)

Lookup order: the element's `drivers` property → the nearest `<gyral-drivers>` provider
(`provideDrivers(element, [driver, …])`) → the command's own driver. Supply drivers as a
**list** (0.3.8): each one under its own name, so there is no key to mistype. A record keyed by
name (`{ http: … }`) still works, and is handy for fakes in tests; development warns when a key
isn't its driver's name (G0045), and two drivers of one name in a list are an error (G0044).
Configure app-wide drivers once, at the entry.

```ts
import { provideDrivers } from '@gyral/core';
import { csrfFromMeta, makeHttpDriver } from '@gyral/http';
import { makeRouter } from '@gyral/router';

// The whole page: this app owns it, so its router captures link clicks.
provideDrivers(document.body, [makeRouter({ captureLinks: true })]);

// One subtree: every component under <main> sends the CSRF token with its requests.
const main = document.querySelector('main');
if (main !== null) {
  provideDrivers(main, [makeHttpDriver({ headers: csrfFromMeta('csrf-token') })]);
}
```

## Driver tokens (no default implementation)

An app service (a game session, a socket, a payment SDK) has no sensible default. Define it by
name alone: the result is a typed **token**. Commands built from it are typed, and it runs only
when a provider or `el.drivers` supplies a driver of that name. If nothing does, the command is
reported as G0043, naming the driver and the component. There are no placeholder drivers that
throw, no import order to get right and no casts.

The entry provides it from the token itself: `token.provide(run)` is a driver with the
token's name and policy and a `run` checked against its input and output, and
`subscription(token, subscribe)` is a subscription the same way. A wrong type fails to compile,
and the name can't be mistyped.

```ts
import { command, defineDriver, provideDrivers, subscription, type Command } from '@gyral/core';

interface Move {
  readonly card: number;
}
interface Snapshot {
  readonly turn: number;
}

// Shared module: the tokens. No implementation here.
export const session = defineDriver<Move, Snapshot, string>('session');
export const scores = defineDriver<undefined, number>('scores');

// Components: fully typed, no type arguments.
export const play = (card: number): Command<{ readonly _tag: 'Synced'; readonly turn: number }> =>
  command(session, { card }, { onSuccess: (s) => ({ _tag: 'Synced', turn: s.turn }) });

// App entry: each implementation from its token, typed by it.
const board = new EventTarget();
provideDrivers(document.body, [
  session.provide(async (move) => ({ turn: move.card })),
  subscription(scores, (emit) => {
    const onScore = (event: Event): void => {
      emit((event as CustomEvent<number>).detail);
    };
    board.addEventListener('score', onScore);
    return () => {
      board.removeEventListener('score', onScore);
    };
  }),
]);
```

Tests provide a fake the same way: `fakeDriver(session, (move) => …)` copies the token's name
and types, in a list for `provideDrivers`, `el.drivers` or `mountSsr`.

## Booting a page: drivers before the first render

A component's `init` commands start after its first render (0.3.7), not when it connects. An
entry that statically imports its components defines them, and connects the elements already
in the page, before its own code runs; their first render is a microtask later. So
`provideDrivers` anywhere in the entry's synchronous code is in time. After an `await` it is
not: provide drivers before awaiting, or create the element in code and set its `drivers`
before inserting it.

```ts
import { command, define, defineDriver, html, provideDrivers } from '@gyral/core';

// components.ts: a token, and a component whose init asks it for something.
const session = defineDriver<string, string>('session');
type Msg = { readonly _tag: 'Named'; readonly name: string };
const Badge = define<{ readonly name: string }, Msg>()('user-badge', {
  init: () => [
    { name: '' },
    [command(session, 'me', { onSuccess: (name): Msg => ({ _tag: 'Named', name }) })],
  ],
  update: { Named: (s, m) => ({ ...s, name: m.name }) },
  view: (s) => html`<p>${s.name}</p>`,
});

const live = session.provide(async (who) => who);

// main.ts, after `import './components.js'`: still the same synchronous run, so in time.
provideDrivers(document.body, [live]);

// After an await it would be too late for elements already in the page. Build the element
// in code instead, with its drivers set before it is inserted:
async function addBadge(): Promise<void> {
  await document.fonts.ready;
  const badge = new Badge();
  badge.drivers = [live];
  document.body.append(badge);
}
void addBadge();
```

## Optional route segments and catch-all routes

`routes({ product: '/products/:id?', docs: '/docs/:path*', notFound: '/:path*' })` supports
optional string captures and trailing catch-all arrays. Omitted optional captures are absent
from params; empty catch-alls are `[]`, including at `/`. Build links with `href`:
`site.href('product', {})` and `site.href('docs', { path: ['guides', 'a/b'] })`.
The latter encodes the slash inside the array item as `%2F`. Keep the not-found route last;
the server must explicitly return status 404. Required values/array entries cannot be empty
or dot segments. Avoid ambiguous omissions in adjacent optional parameters: use a literal
separator; href throws when the URL would capture different parameters.
