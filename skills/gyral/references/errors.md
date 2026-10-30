# Errors

When part of a component throws, Gyral catches it, wraps it in a `GyralError` and reports it
through one channel (ADR 0024). Nothing escapes into the page as an uncaught exception, and
nothing is only logged.

`GyralError` has `component` (the host's tag), `phase`, `msg` (the message tag, intent name or
driver) and `cause` (what was thrown). The channel, in order:

1. the devtools timeline shows an `error` row (development);
2. a bubbling, composed, cancelable `ErrorEvent('error')` is dispatched on the failing host, so
   an ancestor can catch it (a **boundary**) and claim it with `preventDefault()`;
3. the component's own fallback runs: `spec.error` for `init`/view failures, the optional
   `Errored` reducer for update, parse and command failures (with the Vite preset each is
   bundled only when your source names `error` or `Errored`);
4. unless claimed, `reportError(error)`: `window`'s `error` event and monitoring tools see it.

| Phase       | What threw                                                                 | What happens                                                                             |
| ----------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `init`      | `init`                                                                     | No state; `spec.error(failure, undefined)` renders, or the host stays empty              |
| `update`    | a reducer                                                                  | **Nothing changes** (state kept, its commands not run); `Errored`; `send()` never throws |
| `view`      | the view                                                                   | `spec.error(failure, state)` renders, or the previous DOM stays                          |
| `parse`     | an intent parser (throws or rejects)                                       | No message; `Errored`                                                                    |
| `command`   | an `onSuccess`/`onFailure` mapper, or a driver failure without `onFailure` | No message; `Errored`                                                                    |
| `hook`      | an element hook's `client`                                                 | Reported; the other hooks still run                                                      |
| `store`     | a store reducer or subscriber                                              | The store is unchanged (reducer) / the other subscribers are still notified              |
| `subscribe` | a subscription's unsubscribe                                               | Reported; the command still stops                                                        |

## A component's own fallback

`error(failure, state)` renders instead of the view when `init` (`state` is `undefined`) or the
view throws. `Errored` reaches an optional reducer after a failed update, parse or command, so
the component can show an error state or reset. A failure inside either is reported once, never
looped.

```ts
import { command, define, defineDriver, html, type GyralError } from '@gyral/core';

interface Order {
  readonly id: string;
  readonly total: number;
}
type State =
  | { readonly _tag: 'Ready'; readonly orders: readonly Order[] }
  | { readonly _tag: 'Broken'; readonly reason: string };
type Msg =
  { readonly _tag: 'Refresh' } | { readonly _tag: 'Loaded'; readonly orders: readonly Order[] };

const orders = defineDriver<undefined, readonly Order[]>({
  name: 'orders',
  run: async (_input, { signal }) => {
    const response = await fetch('/api/orders', { signal });
    return (await response.json()) as readonly Order[];
  },
});
const refresh = () =>
  command(orders, undefined, { onSuccess: (list): Msg => ({ _tag: 'Loaded', orders: list }) });

export const OrderList = define<State, Msg>()('order-list', {
  init: () => [{ _tag: 'Ready', orders: [] }, [refresh()]],
  intent: { Refresh: true },
  update: {
    Refresh: (s) => [s, [refresh()]],
    Loaded: (_s, m) => ({ _tag: 'Ready', orders: m.orders }),
    // Any failed update, parse or command of this component (the driver failing here too:
    // the command has no onFailure).
    Errored: (_s, m) => ({ _tag: 'Broken', reason: m.error.phase }),
  },
  view: (s, i) =>
    s._tag === 'Broken'
      ? html`<p role="alert">Orders are unavailable (${s.reason}).</p>
          <button type="button" data-intent=${i.Refresh}>Try again</button>`
      : html`<ul>
          ${s.orders.map((o) => html`<li>${o.id}: ${o.total}</li>`)}
        </ul>`,
  error: (failure: GyralError) =>
    html`<p role="alert">Orders failed to show (${failure.phase}).</p>`,
});
```

## A parent boundary

A parent catches a child's failure with the intents it already has: listen for `error` on the
child, read `input.event.error`, and call `preventDefault()` to claim it (no `reportError`).
Re-mount the child to retry (a different template, or a new key in `each()`): its `init` runs
again.

```ts
import { define, html, type GyralError } from '@gyral/core';

interface State {
  readonly attempt: number;
  readonly failed: boolean;
}
type Msg = { readonly _tag: 'WidgetFailed' } | { readonly _tag: 'Retry' };

export const Dashboard = define<State, Msg>()('my-dashboard', {
  init: () => ({ attempt: 0, failed: false }),
  intent: {
    WidgetFailed: (input) => {
      const error = (input.event as ErrorEvent).error as GyralError;
      input.event.preventDefault(); // claimed: this boundary reports it, not the page
      console.info('widget failed in', error.phase);
      return { _tag: 'WidgetFailed' };
    },
    Retry: true,
  },
  update: {
    WidgetFailed: (s) => ({ ...s, failed: true }),
    Retry: (s) => ({ attempt: s.attempt + 1, failed: false }),
  },
  view: (s, i) => html`
    ${
      s.failed
        ? html`<p role="alert">The chart is unavailable.</p>
            <button type="button" data-intent=${i.Retry}>Retry</button>`
        : s.attempt % 2 === 0
          ? html`<div>
              <sales-chart data-intent=${i.WidgetFailed} data-intent-on="error"></sales-chart>
            </div>`
          : html`<p>
              <sales-chart data-intent=${i.WidgetFailed} data-intent-on="error"></sales-chart>
            </p>`
    }
  `,
});
```

## Monitoring

Every unclaimed failure reaches `window` once, through `reportError`. Monitoring code listens
there; `event.error` is the `GyralError`:

```ts
import { GyralError } from '@gyral/core';

window.addEventListener('error', (event) => {
  if (!(event.error instanceof GyralError)) return;
  const { component, phase, msg, cause } = event.error;
  navigator.sendBeacon(
    '/telemetry',
    JSON.stringify({ component, phase, msg, cause: String(cause) }),
  );
});
```

## On the server

A component whose `init` or view throws renders its `error` view (or nothing), marked
`data-gyral-error` and without a seed; the page goes on, and the browser starts that component
fresh. `renderPage`'s `onError` hears each failure (default `console.error`); `onError: 'throw'`
renders the page to a string first and throws before any byte is sent, so the route can answer
with an error page. See `ssr.md`.

## In tests

`reportError` counts as an uncaught error, and Vitest fails the run on one. In a browser test
that makes a component fail on purpose, collect the failures with `collectErrors()` from
`@gyral/testing` (see `testing.md`). `step()` accepts `Errored`.

## Codes you will meet

Development builds print the full sentence, ending with its code and link
(`… (G0010: https://gyral.dev/errors/#G0010)`, 0.3.9); production prints
`Gyral G0010 <arguments…> https://gyral.dev/errors/#G0010`. The full list is at
https://gyral.dev/errors/. The ones agents hit most:

| Code          | Means                                                            | Fix                                                                       |
| ------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| G0010         | a message has no reducer                                         | add the `update` entry for that tag                                       |
| G0011         | `data-intent` names an intent the spec doesn't have              | add the `intent` key, or fix the name (use `i.Name`, not a string)        |
| G0014         | a tag is still undefined 3 s after load (dev builds)             | import the component's module from the entry                              |
| G0015         | two copies of `@gyral/core` are installed or run in the page     | pin one version with package-manager `overrides`, then reinstall          |
| G0016         | a `@gyral/*` package of another release than `@gyral/core`       | install the same version of every `@gyral` package                        |
| G0017         | a skipped view rendered differently (dev builds); says where     | the view reads outside state, props and stores: move that into state      |
| G0018         | an `on('event')` parser reached by another event                 | bind `data-intent-<event>`, or give the intent a parser of its own        |
| G0021 / G0022 | a prop value failed its schema / a required prop is missing      | pass a valid value, or give the prop a `default`                          |
| G0023         | a prop is named like an element member (`hidden`, `state`)       | rename the property; keep the attribute with `attribute:`                 |
| G0024         | page HTML has a lowercased camelCase prop name (`playerbase`)    | write the prop's kebab-case attribute (`player-base`)                     |
| G0033 / G0034 | rendering or `settled()` never settles                           | break the props/messages cycle with a condition in `update`               |
| G0041         | a driver failed and the command has no `onFailure`               | add `onFailure` and a message for the failure                             |
| G0043         | a driver token has no implementation                             | `provideDrivers(root, [token.provide(run)])` at app setup, or a test fake |
| G0044         | two drivers of one name in a list of drivers                     | give each driver its own name, or drop one                                |
| G0045         | a record key that isn't its driver's name (`{ shuot: shout… }`)  | supply a list (`[driver]`), or fix the key                                |
| G0050         | the view reads a store the spec doesn't list                     | add it to `stores: [...]`                                                 |
| G0053         | a store read during a server render without a scope              | pass the request's stores to `renderPage({ stores })`                     |
| G0062 / G0063 | hydration mismatch; the component was rendered fresh             | make the view deterministic (no `Date.now()`, locale) — see `ssr.md`      |
| G0070         | an `html` template reached the browser uncompiled                | build with `gyral()`                                                      |
| G0073 / G0074 | a reducer / `init` threw (state kept / error view shown)         | fix the throw; handle it with `Errored` or `error` (above)                |
| G0078         | a component threw during a server render                         | as above; the browser renders it fresh                                    |
| G0079 / G0080 | two subscriptions share a lane / a subscription keeps restarting | give each its own `key` / keep changing data out of its input             |
