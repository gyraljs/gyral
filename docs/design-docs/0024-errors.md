# ADR 0024 — Errors: one reporting channel, component fallbacks, parent boundaries

Status: **accepted** (2026-10-09; the owner accepted every recommendation, see "Decision"),
shipped in **0.3.1**. Bead: gyral-1zd.8. Builds on ADR 0006
(commands and drivers), ADR 0012 (server rendering and seeds), ADR 0013 (stores), ADR 0016
(production builds and error codes), ADR 0017 (devtools) and view/04-scheduler.md.

**Scope note (owner, 2026-10-08):** 0.3.1 may break 0.3.0 behaviour this once. Error handling
is behaviour: once 0.3.1 ships, whatever Gyral does when a reducer or view throws becomes a
promise. This ADR is written now so that promise is a deliberate one.

## Context

Gyral has no error design. Each part of the runtime does something local and reasonable, and
together they are inconsistent: some failures reach `window`'s `error` event, some only the
console, one becomes an unhandled rejection, and two leave other components stale. Nothing
tells a monitoring tool which component failed or in which phase, and the server sends a
`200` with a truncated page.

### Today's behaviour (0.3.1-next.5, measured)

Probed in Chromium with throwing `init`, reducers, views, parsers, drivers, mappers, store
reducers, hooks and children (a throwaway browser test), and on the server with
`renderPage`. Development and production builds behave the same except where noted.

| What throws                                           | What happens today                                                                                                                                                                                  | State                                                   | Reported where                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------- |
| `init` (client)                                       | Escapes `connectedCallback`. The root and listeners exist, nothing renders; the next connect retries `init` inside a render (G0031)                                                                 | none: the host stays empty                              | `window` `error` (browser reports the callback) |
| Reducer, for an intent                                | Escapes the event listener                                                                                                                                                                          | unchanged (reducer threw before the state was replaced) | `window` `error`                                |
| Reducer, for a command result                         | Caught by the interpreter and logged as **G0040 "command mapper threw"**: the wrong phase                                                                                                           | unchanged                                               | console only                                    |
| Reducer, via `el.send()`                              | Thrown to the caller                                                                                                                                                                                | unchanged                                               | the caller                                      |
| Reducer for `PropsChanged`                            | Aborts the render (G0031); the props change is marked seen, so `PropsChanged` is lost                                                                                                               | unchanged, props message lost                           | console only                                    |
| Reducer for `Hydrated`, or init's deferred commands   | Post-render work fails (G0032)                                                                                                                                                                      | unchanged                                               | console only                                    |
| Intent parser, synchronous                            | Escapes the event listener; no `IntentRejected`                                                                                                                                                     | unchanged                                               | `window` `error`                                |
| Intent parser, async, rejects                         | G0012                                                                                                                                                                                               | unchanged                                               | console only                                    |
| Intent parser, async, then its reducer throws         | **Unhandled promise rejection** (the reducer runs in `.then`'s fulfilment handler, outside the rejection handler)                                                                                   | unchanged                                               | `unhandledrejection`                            |
| View, first or later render                           | Caught by the scheduler (G0031): the previous DOM stays (empty on the first). A server-rendered host stays unhydrated and its deferred init commands and `Hydrated` wait for a render that succeeds | kept                                                    | console only                                    |
| Element hook `client`                                 | The DOM is already committed; **the remaining hooks of that render are skipped**; logged as G0031 "failed to render"                                                                                | kept                                                    | console only                                    |
| Child component's view                                | The child keeps its previous (empty) DOM; the parent is unaffected                                                                                                                                  | kept                                                    | console only                                    |
| Driver fails, command has `onFailure`                 | `onFailure` maps it to a message (designed path)                                                                                                                                                    | per reducer                                             | —                                               |
| Driver fails, no `onFailure`                          | G0041 as a warning                                                                                                                                                                                  | unchanged                                               | `console.warn` only                             |
| `onSuccess` / `onFailure` mapper                      | G0040, the message is dropped                                                                                                                                                                       | unchanged                                               | console only                                    |
| Subscription's `subscribe` / unsubscribe              | `subscribe` throwing becomes the driver's failure (above); unsubscribe throwing is G0042                                                                                                            | —                                                       | per row above / console                         |
| Store reducer                                         | Thrown to whoever sent: a component's `send()` runs synchronously, so it escapes that component's dispatch                                                                                          | store unchanged                                         | the sender's path                               |
| A subscriber's `StoreChanged` reducer                 | Escapes the store's notify loop: **later subscribers are never notified and the store's commands never run**, although the store's state already changed                                            | store changed, other components stale                   | the sender's path                               |
| Render loop (too many renders)                        | Development: thrown from a microtask (or rejects `settled()`); production: G0033 logged, the flush dropped                                                                                          | kept                                                    | dev `window` `error`; prod console              |
| Hydration mismatch                                    | Development throws; production clears the component and renders fresh (G0063)                                                                                                                       | kept                                                    | dev `window` `error`; prod `console.warn`       |
| Server: a component's `init` or view in `renderPage`  | Status `200` and the head are already sent; the body stream errors mid-page (the probe got 214 bytes, then the error); the Node adapter cuts the connection                                         | —                                                       | the stream consumer                             |
| Server: same, with `csp: { styleAttributes: 'hash' }` | `renderPage` throws (it renders to a string first), so the app can answer `500`                                                                                                                     | —                                                       | the app                                         |

Two rows are bugs whatever the design (the `StoreChanged` notify loop and the skipped hooks),
and two are mislabelled (G0040 for reducers, G0031 for hooks).

### Platform primitives

| Primitive                                                             | What it gives                                                                                                                                                                    | Baseline                                                                                             |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `reportError(error)`                                                  | Reports an error to the global scope exactly as if it were uncaught: fires `window` `error` with an `ErrorEvent`, logs to the console unless a listener calls `preventDefault()` | Chrome/Edge 95, Firefox 93, Safari 15.4: newly available 2022-03-14, **widely available 2024-09-14** |
| `window` `error` event, `ErrorEvent`                                  | The channel every monitoring tool already listens on; `event.error` carries the original object                                                                                  | widely available (all engines for over a decade)                                                     |
| `unhandledrejection`, `PromiseRejectionEvent`                         | Rejections nobody handled                                                                                                                                                        | Firefox 69, Edge 79: newly 2020-01-15, widely available 2022-07-15                                   |
| `Error` `cause`                                                       | Wrap an error with context and keep the original                                                                                                                                 | widely available                                                                                     |
| `EventTarget.dispatchEvent` of a bubbling, composed, cancelable event | A failing element can tell its ancestors, across shadow roots, and an ancestor can claim it with `preventDefault()`                                                              | widely available                                                                                     |

Node has no global `reportError`; Deno and Bun do. The server path therefore needs its own
hook.

### How other component frameworks approach it (concepts only)

- **Boundaries** are components that catch failures in their subtree's render and show a
  fallback; some also catch failures in lifecycle code, few catch event-handler or async
  failures (those go to the global channel).
- **A global hook** on the app instance receives every caught error with the component and
  the phase, and is where monitoring is wired.
- **Recovery** is usually a reset: the boundary re-mounts its subtree (often by changing a
  key), discarding the failed component's state.
- **Server rendering** either streams a fallback for the failed subtree and lets the client
  retry it, or aborts before the first byte so the app can send an error page.

Gyral can get the same capabilities with less API, because it already has the pieces: every
host is a custom element (it can dispatch a native event to its ancestors), parents already
turn child events into intents (`data-intent-on`), keyed `each()` already re-mounts, and the
platform already has a reporting channel.

## Decision options

### 1. The global channel

- **A. `reportError` only (recommended).** Every failure Gyral catches is reported with
  `reportError(new GyralError(…))`. No new API: `window.addEventListener('error', …)` and every
  monitoring tool see it, with `event.error` a `GyralError` carrying the context (below).
  Development consoles show it as uncaught, as they do today for half the rows.
- **B. `setErrorHandler(fn)` in core.** One handler replaces the default (`reportError`). More
  API, a module-level global to reset in tests, and a second channel to explain.
- **C. Both.** A handler that defaults to `reportError`. Only worth it if a real app needs to
  intercept before the window listeners; none has asked.

`GyralError extends Error`:

```ts
export type ErrorPhase =
  'init' | 'update' | 'view' | 'parse' | 'command' | 'hook' | 'store' | 'subscribe';

export class GyralError extends Error {
  readonly name = 'GyralError';
  readonly component: string | undefined; // the host's tag, `undefined` for a store
  readonly phase: ErrorPhase;
  readonly msg: string | undefined; // the message tag being reduced, or the intent name
  // `cause` (standard) is the original thrown value.
}
```

Its `message` is `<tag> failed in <phase> (<msg>)` in development and a code (`G0073 tag
phase msg`) in production (ADR 0016).

### 2. The component's own fallback

- **A. A `error` spec field plus an `Errored` framework message (recommended).**
  `error: (failure: GyralError, state: S | undefined) => TemplateResult` renders instead of the
  view when `init` or the view throws (`state` is `undefined` when `init` threw). An optional
  `Errored` reducer receives `{ _tag: 'Errored', phase, error }` after a failure in `update`,
  `parse` or `command`, so the component can show its own error state or reset; its
  commands run normally. The fallback and the reducer are spec-field features (view/05
  "Features register themselves"): apps that don't use them pay nothing for them.
- **B. `Errored` only.** The component must keep an `error` field in its state and the view
  must branch on it; a throwing view still leaves the previous DOM.
- **C. Neither.** Leave fallbacks to parents (option 3).

Rules either way:

- **A reducer that throws changes nothing.** The state stays what it was and its commands
  don't run (today's behaviour, now a documented contract).
- **A failure while handling `Errored`, or in the `error` view, is reported and ends there:**
  no second `Errored`, and the previous DOM stays. No loops.
- **Recovery** inside the component is the `Errored` reducer returning a different state (often
  `init`'s); a throwing `init` can only be retried by re-mounting (option 3).

### 3. Parents catching a child's failure (boundaries)

- **A. A bubbling `ErrorEvent` on the failing host (recommended).** Before reporting, the failing
  host dispatches `new ErrorEvent('error', { error: gyralError, bubbles: true, composed: true,
cancelable: true })` on itself. Any ancestor can catch it with the intents it already has:

  ```ts
  html`<order-summary data-intent=${i.SummaryFailed} data-intent-on="error"></order-summary>`;
  ```

  The parser reads `input.event.error`. If an ancestor calls `preventDefault()` (a parser can,
  or a plain listener), Gyral doesn't call `reportError`: the boundary has claimed it.
  Recovery is the parent re-rendering the child under a new key (keyed `each()`, or a
  `key`-ed slot), which re-mounts it with a fresh `init`. No boundary component type, no new
  API beyond the event.

- **B. A custom event type (`gyral-error`).** Avoids any confusion with an `img`'s `error`
  event, which doesn't bubble or cross a shadow root anyway. Less native for monitoring code.
- **C. No parent catch in 0.3.1.** Add it later; additive.

### 4. Server rendering

- **A. Per-component isolation plus `onError` (recommended).** On the server a component whose
  `init` or view throws renders its `error` view if it has one, otherwise an empty host
  marked `data-gyral-error`, and the page continues. The client sees the marker, skips
  hydration for that host and starts it fresh (its `init` runs in the browser and may
  succeed). `renderPage`, `renderToStream` and `renderToString` take `onError(error:
GyralError)`, defaulting to `console.error`, for logging and monitoring. The status stays
  what the app set: a page with one failed widget is still a page.
- **B. Buffer-and-fail.** An option that renders to a string first (as `styleAttributes: 'hash'`
  already does) and throws on any failure, so the app answers `500`. Loses chunked output.
- **C. Both:** A by default, B via `renderPage({ onError: 'throw' })` for apps that prefer a
  hard failure. Small, because the buffered path exists.

An **error page** stays the app's job: data loading happens before `renderPage` (ADR 0012), so
the route handler already catches its own failures and renders an error page with the right
status. This ADR documents that pattern instead of adding a hook.

### 5. Development and production

The same behaviour in both. Differences are only in text: development messages are sentences
and the `GyralError` carries the full message; production uses codes (`G0073`, ADR 0016). The
render-loop guard keeps its current split (development throws so the bug is found;
production drops the flush) but reports through the same channel.

### 6. Devtools

A new timeline event `{ kind: 'error', component, phase, msg, error }` (ADR 0017), emitted only
when devtools are enabled, shown in the timeline in the error colour next to the update or
command that caused it.

### 7. Things that become consistent whatever is chosen above

- Each `StoreChanged` subscriber is isolated: one failing subscriber is reported and the
  others are still notified; the store's commands still run.
- Each element hook is isolated: one failing `client` is reported (phase `hook`) and the
  remaining hooks of the render still run.
- A reducer failure for a command result is reported as phase `update`, not as a mapper
  failure; a mapper failure is phase `command`.
- An async parser's reducer failure is reported, never an unhandled rejection.
- A failed `PropsChanged` doesn't lose the props message: it is retried with the next render.

## Recommendation

1A, 2A, 3A, 4C, plus everything in 7. Concretely, one internal `fail(error, context)` in core:

1. wrap the error in a `GyralError` (unless it already is one);
2. emit the devtools event;
3. dispatch the bubbling, cancelable `ErrorEvent` on the failing host (stores have no host and
   skip this step);
4. deliver `Errored` to the component (if it has the reducer), or render its `error` view (for
   `init` and view failures), whether or not an ancestor claimed the event: claiming only
   decides who reports it;
5. if no ancestor claimed it, `reportError` it.

Every catch site in the table calls `fail()` instead of logging. On the server, the same
`fail()` calls `onError` instead of steps 3–5.

## Behaviour changes from 0.3.0 (and next.5)

| #   | Change                                                                                                                                                                                      | Who notices                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Errors that were only logged (G0012, G0030, G0031, G0032, G0040, G0041) are now reported with `reportError`: `window` `error` listeners and monitoring tools see them                       | Apps with monitoring (good); **test runners that fail on uncaught errors** (Vitest browser mode does) see deliberate failures in tests |
| 2   | A driver failure with no `onFailure` is an error (reported), not a warning                                                                                                                  | Apps that ignored failed commands                                                                                                      |
| 3   | Errors that escaped to `window` (a throwing `init`, a sync parser, a reducer for an intent) are caught and reported with context instead; the browser still sees them through `reportError` | Code that relied on the exception escaping `connectedCallback` or the listener                                                         |
| 4   | `el.send()` reports a reducer failure instead of throwing to the caller                                                                                                                     | Code that wrapped `send()` in `try`                                                                                                    |
| 5   | A failing `StoreChanged` subscriber no longer stops other subscribers or the store's commands                                                                                               | Apps that hit the bug                                                                                                                  |
| 6   | A failing hook no longer skips the remaining hooks of the render                                                                                                                            | Apps that hit the bug                                                                                                                  |
| 7   | Server: a component that throws renders its fallback (or an empty marked host) and the page continues, instead of a truncated body                                                          | Apps with failing components on the server; `onError: 'throw'` keeps a hard failure                                                    |
| 8   | New error codes `G0073`–`G0078`; G0031's, G0040's and G0041's texts are re-scoped                                                                                                           | Docs and anyone matching on codes                                                                                                      |
| 9   | `spec.error`, `Errored`, `GyralError`, `ErrorPhase` and `renderPage({ onError })` are new API                                                                                               | Additive                                                                                                                               |

## Implementation plan (0.3.1)

| Area          | Files                                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The channel   | new `packages/core/src/errors.ts` (`GyralError`, `ErrorPhase`, `fail()`), `index.ts` exports, `view/messages.ts` (G0073)                                                                                                                                                                                                                                                       |
| Catch sites   | `host-model.ts` (dispatch, `Errored`), `element.ts` (init, view, `error` view, `Connected`), `intent.ts` (sync and async parsers), `internal/interpreter.ts` (split mapper vs reducer failures; no-`onFailure` path), `store.ts` (isolated listeners), `view/render/hooks.ts` (isolated hooks), `scheduler.ts` (render and post-render catches, loop guard), `subscription.ts` |
| Spec features | `spec-features.ts` / `spec-features-used.ts` and the compiler's feature scan for `error` and `Errored`                                                                                                                                                                                                                                                                         |
| Types         | `types.ts` (`ComponentSpec.error`, `Errored`, `Update` optional reducer)                                                                                                                                                                                                                                                                                                       |
| Server        | `server-component.ts` and `view/server` (per-component isolation, `data-gyral-error`), `hydration-client.ts` (skip marked hosts), `packages/ssr/src/index.ts` (`onError`, `'throw'`)                                                                                                                                                                                           |
| Devtools      | `devtools-events.ts`, `devtools.ts`, `packages/devtools` timeline row                                                                                                                                                                                                                                                                                                          |
| Testing       | `@gyral/testing`: `step()` accepts `Errored`; a browser helper `collectErrors()` that claims (`preventDefault`) and returns reported `GyralError`s, so deliberate failures don't fail a Vitest run                                                                                                                                                                             |
| Docs          | view/05 "Errors", view/04 (scheduler catches), view/06 (server), ADR 0006 addendum, skill (components, testing), `migrating-0.3.0-to-0.3.1.md` rows, `errors.md` (G0073)                                                                                                                                                                                                       |

Tests: one browser test per row of the table (each fails on today's code where behaviour
changes), parent boundary with re-mount by key, claim suppresses `reportError`, no loop when
`Errored` or the `error` view throws, store subscriber isolation, hook isolation, production
build (codes), server isolation and `'throw'`, hydration of a marked host, devtools event.

**Size estimate** (gzip): `fail()`, `GyralError` and the try/catch at each site in every app,
about **+0.2 to +0.3 KiB**; the `error` view and `Errored` only in apps that use them, about
+60 to +100 B; server isolation 0 B on the client except the marked-host check in the lazily
loaded hydration chunk (about +20 B). Budgets would move by 0.1–0.3 KiB; the budget file
records the reason as usual.

## Decision (owner, 2026-10-09)

Every recommendation is accepted: 1A (`reportError` only, no `setErrorHandler`), 2A
(`spec.error` plus `Errored`), 3A (a bubbling, composed, cancelable `ErrorEvent('error')` on the
failing host, caught with `data-intent-on="error"` and claimed with `preventDefault()`), 4C
(server isolation with `onError`, default `console.error`, and `onError: 'throw'`), `el.send()`
reports instead of throwing, a driver failure without `onFailure` is an error, and
`collectErrors()` ships in `@gyral/testing`.

### As built

- **`fail(cause, phase, text, { host, tag, msg })`** in `packages/core/src/errors.ts`;
  `GyralError(phase, text, cause, component?, msg?)` is exported from `@gyral/core` with
  `ErrorPhase` and the `Errored` message type. `Errored` is sent for `update`, `parse` and
  `command` failures (a hook has no reducer context); `init` and view failures use `spec.error`.
- **The boundary event stops at the document.** An event dispatched on an element bubbles to
  `window` too, so without a stop every unclaimed failure would reach `window` `error` twice (the
  bubbling event, then `reportError`), and monitoring tools would count it twice. The first
  `fail()` adds one document listener that stops a `GyralError` event's propagation; ancestors'
  boundaries (capture listeners on their roots) still see it first. A `window` listener in the
  capture phase still sees the event before the stop; a regression test checks that the bubble
  phase sees each failure once, from `reportError`.
- **Hooks:** view/ may not import core (ADR 0018), so `runHooks` isolates each `client` call and
  hands failures to a handler core's element.ts installs (`onHookFailure`); unset, the first
  failure is rethrown after every hook ran.
- **Server:** `ServerRendering.failed` carries the `GyralError` from `server-component.ts`, and
  `view/server/component.ts` writes `data-gyral-error` instead of the seed and calls the
  render's `onError`. A view value that fails while being written uses
  `ServerComponent.fallback`. The client check lives in element.ts (it removes the marker and
  clears the root), not in the hydration chunk.
- **Codes:** G0073 (update), G0074 (init), G0075 (hook), G0076 (store reducer), G0077 (store
  subscriber), G0078 (server component); G0012, G0030, G0031, G0032, G0040, G0041 and G0042 are
  now the messages of reported `GyralError`s, G0031/G0040/G0041 with new texts.
- **Tests:** `packages/core/test/errors-cases.ts` (run by `errors.test.ts` and
  `errors.prod.test.ts`), `errors-hydration.test.ts`, `packages/ssr/test/errors.node.test.ts`,
  `packages/testing/test/errors.test.ts`, and the devtools model test.

## Open questions for the owner (answered above)

1. **Global channel:** `reportError` only (**recommended**), or also a `setErrorHandler`?
2. **Parent catch:** a bubbling, cancelable `ErrorEvent` named `error` (**recommended**), a
   custom `gyral-error` event, or no parent catch in 0.3.1?
3. **Component fallback:** `spec.error` view plus `Errored` (**recommended**), or `Errored`
   only?
4. **`el.send()`:** report instead of throwing (**recommended**, one channel), or keep throwing
   to the caller?
5. **Driver failure without `onFailure`:** report as an error (**recommended**), or keep the
   warning?
6. **Server:** isolate components with `onError`, plus `onError: 'throw'` for a hard failure
   (**recommended**); isolation only; or buffer-and-fail only?
7. **Tests:** ship `collectErrors()` in `@gyral/testing` and document that deliberate failures
   must be collected (**recommended**), or leave it to apps?
