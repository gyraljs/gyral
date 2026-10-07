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

export const save = <M>(key: string, value: string, onFailure: (reason: string) => M): Command<M> =>
  command<SaveInput, void, string, M>(
    storage,
    { key, value },
    {
      onSuccess: () => undefined, // nothing to report on success
      onFailure,
    },
  );
```

`Driver<I, O, E>` fields: `name` (substitution key), `run(input, { signal, emit })` returning
`O` or a `Promise<O>`, optional default `concurrency`, `retry`, and `toError` (turns a thrown
value into the typed error `E` that `onFailure` receives). Without `onFailure`, failures are
logged and dropped. `onSuccess` returning `undefined` sends no message.

## Concurrency (per lane: `key`, default the driver name)

| Policy            | Behaviour                                | Use for                      |
| ----------------- | ---------------------------------------- | ---------------------------- |
| `merge` (default) | run all concurrently                     | independent writes, logging  |
| `switch`          | abort the in-flight one, run the new one | search as you type, debounce |
| `exhaust`         | drop new ones while one is in flight     | submit buttons, refresh      |
| `queue`           | one at a time, in order                  | ordered saves                |

Set per command (`{ key: 'search', concurrency: 'switch' }`) or as the driver's default.
`retry: { times, delayMs?, backoff?: 'fixed' | 'exponential' }` retries failures.

## Streaming drivers

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
import { listen, navigate, routes, setTitle, type RouteLocation } from '@gyral/router';
import { delay, periodic } from '@gyral/time';

export const site = routes({ home: '/', product: '/products/:id' });

interface State {
  readonly path: string;
  readonly seconds: number;
  readonly saved: boolean;
}
type Msg =
  | { readonly _tag: 'Routed'; readonly location: RouteLocation }
  | { readonly _tag: 'Tick'; readonly seconds: number }
  | { readonly _tag: 'Open'; readonly id: string }
  | { readonly _tag: 'Save' }
  | { readonly _tag: 'Saved' }
  | { readonly _tag: 'SaveFailed'; readonly error: HttpError }
  | { readonly _tag: 'HideToast' };

export const Shell = define<State, Msg>('my-shell', {
  init: () => [
    { path: '/', seconds: 0, saved: false },
    [
      listen((location) => ({ _tag: 'Routed', location })), // current URL, then every change
      periodic(1000, (ticks) => ({ _tag: 'Tick', seconds: ticks })),
    ],
  ],
  intent: {
    Open: ({ value }) => (value === undefined ? undefined : { _tag: 'Open', id: value }),
    Save: () => ({ _tag: 'Save' }),
  },
  update: {
    Routed: (s, m) => [
      { ...s, path: m.location.pathname },
      [setTitle(`Shop — ${m.location.pathname}`)],
    ],
    Tick: (s, m) => ({ ...s, seconds: m.seconds }),
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

- **`@gyral/http`**: `get(url, handlers)`, `request(req, handlers)` (method, headers, JSON or
  form `body`, `schema` / `errorSchema` with any Standard Schema library, `csrf`),
  `submitForm(url, formData, options)` for forms (see forms.md). Errors are a typed union:
  `HttpStatusError` (with `status`, `body`, `detail`), `HttpNetworkError`, `HttpDecodeError`.
  App-wide headers: `makeHttpDriver({ headers: csrfFromMeta('csrf-token') })`.
- **`@gyral/time`**: `delay(ms, msg)`, `debounce(ms, msg, key?)` (a `switch` delay),
  `periodic(ms, toMsg)`, `animationFrames(toMsg)`. An app that only needs `delay` and
  `debounce` imports them from `@gyral/time/delay` (same API, a delay-only driver also named
  `time`; about 0.15 KiB less).
- **`@gyral/router`**: `listen(toMsg)` from `init`, `navigate(url, { replace? })`,
  `back()`, `forward()`, `go(n)`, `setTitle(title)`, typed `routes({...})` tables with
  `match(url)` and `href(name, params)` (same table on server and client). Link clicks are
  captured only with `makeRouter({ captureLinks: true })` given as the `router` driver of the
  component that owns the page.

## Substituting drivers (by name)

Lookup order: the element's `drivers` property → the nearest `<gyral-drivers>` provider
(`provideDrivers(element, { http: … })`) → the spec's `drivers` → the command's own driver.

```ts
import { define, html, provideDrivers, type Stateless } from '@gyral/core';
import { csrfFromMeta, makeHttpDriver } from '@gyral/http';
import { makeRouter } from '@gyral/router';

// Per component type: this app shell owns the page, so it captures link clicks.
export const App = define<Stateless, never>('my-app', {
  drivers: { router: makeRouter({ captureLinks: true }) },
  intent: {},
  update: {},
  view: () => html`<slot></slot>`,
});

// Per subtree: every component under <main> sends the CSRF token with its requests.
const main = document.querySelector('main');
if (main !== null) {
  provideDrivers(main, { http: makeHttpDriver({ headers: csrfFromMeta('csrf-token') }) });
}
```
