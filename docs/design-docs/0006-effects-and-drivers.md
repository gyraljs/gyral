# ADR 0006 — Effects as data, drivers as plain objects

Status: **accepted** (2026-10-04). Implements ADR 0002. Bead: gyral-czi.2.

> **Superseded in part by [ADR 0018](0018-view-layer.md)** (2026-10-06, shipped in 0.3.0): Lit is gone, so Lit add-ons such as `@lit/context` are no longer an alternative, and there is no Lit dev-mode banner. Lit-specific text below describes 0.2.x.

## Decision

### Reducers (and `init`) may return commands

```ts
update: {
  Search: (s, m) => [{ ...s, query: m.q }, [searchRepos(m.q)]],   // state + commands
  Clear: (s) => ({ ...s, results: [] }),                         // state only
}
```

The return type is `S | readonly [S, ReadonlyArray<Command<M>>]`. **State must not be an
array** (it is always a record in Gyral), so a 2-tuple with a command list is unambiguous.

### A command is data plus two pure mappers

```ts
interface Command<M> {
  readonly driver: Driver<unknown, unknown, unknown>; // which driver runs it
  readonly input: unknown; // what to do (serialisable data)
  readonly key?: string; // concurrency lane, default driver.name
  readonly concurrency?: Concurrency; // overrides the driver default
  readonly onSuccess: (output: unknown) => M | undefined;
  readonly onFailure: (error: unknown) => M | undefined;
}
```

Build them with `command(driver, input, { onSuccess, onFailure?, key?, concurrency? })`,
which ties the mappers' types to the driver's `I`, `O` and `E`. Driver packages ship typed
helpers on top (for example `get(url, {...})` in `@gyral/http`).

**Why mappers at the effect site** (not fixed driver message tags such as Cycle's
`HTTP.select('category')`): the reducer that asks for work also says which message the
answer becomes. That keeps the request and the response handling next to each other, typed
end to end, with no category strings. The mappers are pure, so devtools can still log
`driver.name` + `input`. If `onFailure` is omitted, failures are logged and dropped.

### A driver is a plain object

```ts
interface Driver<I, O, E = unknown> {
  readonly name: string;
  readonly run: (input: I, ctx: { readonly signal: AbortSignal }) => O | Promise<O>;
  readonly concurrency?: Concurrency; // default 'merge'
  readonly retry?: RetryPolicy; // default: no retry
  readonly toError?: (cause: unknown) => E; // thrown/rejected → typed error
}
type Concurrency = 'merge' | 'switch' | 'exhaust' | 'queue';
interface RetryPolicy {
  times: number;
  delayMs?: number;
  backoff?: 'fixed' | 'exponential';
}
```

`defineDriver({...})` is an identity helper for type inference.

| Policy  | Per lane (`key`, default `driver.name`) | Use for                      |
| ------- | --------------------------------------- | ---------------------------- |
| merge   | run all concurrently                    | independent writes, logging  |
| switch  | interrupt the in-flight one, run new    | search-as-you-type, debounce |
| exhaust | drop new while one is in flight         | "submit" buttons, refresh    |
| queue   | run one at a time, FIFO                 | ordered saves                |

### Providing drivers: the command carries its default; overrides by name

A command references a driver object, so most apps need no wiring at all. To substitute (test
fakes, configured instances), drivers are looked up **by `name`** in this order:

1. the element instance's `drivers` property (`el.drivers = { http: fake }`) — tests;
2. the spec's `drivers` option (`define()(tag, { drivers: { http: makeHttpDriver({...}) } })`);
3. the driver object on the command.

We chose this over a `@lit/context` provider because it needs no extra element, no
dependency, and works for a component tested in isolation. An ancestor-provided registry
(context) can be added later without changing this API; overrides would slot in at step 1.5.

### Lifecycle and runtime

- Each element owns an interpreter (`packages/core/src/internal/interpreter.ts`). Each running
  command is a task with its own `AbortController`; lanes hold the latest task per key.
  (Until 0.1.x commands ran as Effect fibers; ADR 0015 removed Effect in 0.2.0.)
- Cancellation: `switch` and `disconnectedCallback` abort in-flight tasks; their `signal`
  aborts, and their results are never dispatched.
- Retries are timers that cancel on abort (fixed or exponential delay, `times` cap). Only
  failures retry; aborts never do.
- A driver failure becomes `onFailure(toError(cause))`, a message. Nothing is thrown into
  the view.

## Consequences

- Public types are plain TypeScript (checked); no package depends on Effect (ADR 0015).
- Debounce is "switch + delay": a timer driver with `concurrency: 'switch'` (see the
  http-search-github example). The time driver package (gyral-ud5.3) generalises this.
- Virtual time for retry/debounce tests lives in `@gyral/testing` (see Testing below).

## Testing (`@gyral/testing`, gyral-czi.7)

- **Pure:** `initial(spec, props?)`, `step(spec, state, msg, props?)` and
  `run(spec, msgs, { props?, state? })` return `{ state, commands }`, so tests never cast
  `Next`. Framework messages (`PropsChanged`, `IntentRejected`) step like any other.
  `inputsFor(commands, driver)`, `resolve(cmd, output)` and `reject(cmd, error)` drive the
  loop through a command's mappers with no DOM.
- **Outputs and focus** (gyral-dyn.8, 0.3.1): `outputsIn(commands, Component)` returns what a
  reducer sent to the parent with `emit()` / `outputs<O>()`, typed by the class's output union
  (`OutputsOf<C>`; `outputsIn<Out>(commands)` names the union instead), and
  `focusTargetsIn(commands)` returns each `focus()` request as `{ selector, ...options }`. Core
  runs both commands itself with marker drivers; tests once filtered on their names
  (`'@gyral/emit'`, `'@gyral/focus'`), which are internals. **Decision:** core keeps the marker
  drivers private (no `EMIT`/`FOCUS` export); the helpers take the names from the public
  builders (`emit(…).driver`, `focus(…).driver`), so the names may change without breaking a
  test. Export them only if a need appears that these helpers can't cover.
- **DOM:** `fakeDriver(driverOrName, { impl?, toError?, … })` records each call (input and
  `AbortSignal`) and waits for `resolveNext` / `rejectNext` (or `calls[i].resolve`). Errors
  pass through unchanged, so a test rejects with the already-typed error. Streaming commands:
  `fake.emitNext(value)` pushes into the newest running call, or use `calls[i].emit(value)`
  for a specific one (gyral-czi.15). Emits into a settled or aborted call are ignored, like
  the real runtime.
- **Disconnect interrupts one microtask later** (0.3.1, gyral-dyn.33; until next.4 it was
  synchronous, gyral-g1r.29): `disconnectedCallback` schedules the disposal of the element's
  interpreter for the next microtask. If the element is connected again first (a move with
  `appendChild`/`insertBefore`, which disconnects and connects in one task), the disposal is
  cancelled and every command keeps running. Otherwise the interpreter is disposed, which aborts
  every running or queued command's `AbortController`; `abort` listeners run inside `abort()`,
  and no later result of those commands is dispatched. A host attached again after that gets
  the optional framework message `Connected { reconnect: true }` to re-issue long-lived
  commands (view/05 "Moves and reconnects"). Tests assert `signal.aborted` after
  `el.remove(); await Promise.resolve();` (or `await clock.advance(0)` under `virtualTime()`).
  Why: list libraries and DOM code reorder elements by removing and re-inserting them, and a
  synchronous dispose ended `init`'s subscriptions for good on every reorder.
- **Virtual time:** `virtualTime()` installs `@sinonjs/fake-timers` (timers, `Date`, rAF;
  microtasks stay real) and offers `advance(ms)` / `runAll()` / `restore()`. ADR 0002
  promised Effect's `TestClock`. We patch the **platform** clock instead, because Effect's
  default clock sleeps through `setTimeout`. That way one API covers drivers, debounces
  and runtime retry delays, and it keeps working if the interpreter moves to
  `effect/Micro` (gyral-czi.9), which has no `TestClock`.

## Streaming drivers (gyral-ud5.4, 2026-10-04)

`DriverContext` has `emit(output)` next to `signal`. A driver calls it to deliver extra
results while a command runs; each value goes through the command's `onSuccess`. Emits are
ignored once the command has settled or been aborted (switched away, or the component
disconnected). A streaming `run` usually returns a promise that never resolves; abort ends
it. A finite stream may resolve, and its resolved value is delivered last. Used by
`listen()` in `@gyral/router` and by `@gyral/time`.

### Outside sources: `subscription()` (gyral-c5d.5, 0.3.1)

Apps keep some state in stores Gyral doesn't own: an app migrated to Gyral kept its domain
state in a TC39-signals store, read through a hand-written streaming driver (`Signal.subtle.Watcher`,
re-armed in a microtask, unwatched on abort) and written with a `play` command whose driver
calls `store.dispatch` synchronously. Every such driver repeats the same plumbing: a promise
that never resolves, an abort listener, the unsubscribe, ignoring late values. Core now ships
it once:

```ts
function subscription<O, I = undefined, E = unknown>(
  name: string,
  subscribe: (emit: (value: O) => void, ctx: SubscriptionContext<I>) => Unsubscribe,
  options?: SubscriptionOptions<E>, // concurrency (default 'switch'), retry, toError
): Driver<I, O, E>;
interface SubscriptionContext<I> {
  readonly input: I;
  readonly signal: AbortSignal;
  readonly fail: (error: unknown) => void; // ends it: onFailure, after retry
}
type Unsubscribe = (() => void) | { readonly unsubscribe: () => void };
```

- It returns a driver, not a command: drivers are what tests and pages substitute by name,
  and `command(driver, input, { onSuccess, key? })` already maps values to messages with the
  lane rules. A `fromSource({ subscribe, getSnapshot })` shape was rejected: Redux
  (`subscribe` + `getState`), XState (`subscribe` returns `{ unsubscribe }`), signals (a
  watcher) and sockets (events) differ in exactly the part such a shape would fix, while
  "subscribe and return how to stop" covers them all in two or three lines (recipes in the
  skill's `references/outside-stores.md`).
- Cleanup is automatic: abort (lane `switch`, disconnect) and `fail()` release the source
  once, emits after that are ignored, and an unsubscribe that throws is logged. A `subscribe`
  that throws, or `fail(error)`, rejects the run with that error as is, so `toError`,
  `onFailure` and `retry` (which subscribes again: socket reconnects) work as for any driver.
- Default lane policy `'switch'` (like `listen()` and `periodic()`): re-issuing the command
  replaces the subscription; a per-input `key` keeps several.
- Writing stays a plain driver; the change comes back through the subscription.
- A standalone module (`subscription.ts`), so apps that don't import it don't bundle it; it
  needs no feature slot because `command()` already registers the interpreter.
- `settled()` doesn't wait for subscriptions (they never finish) but waits for the messages
  they deliver (view/04 "`settled()`").

### `@gyral/time` (gyral-ud5.3)

One `time` driver (substitutable by name) with four commands. Each command kind has its own
default lane, and a `Lane` option (`key`, `concurrency`) lets timers coexist:

| Command                   | Kind                        | Default lane / policy                                         |
| ------------------------- | --------------------------- | ------------------------------------------------------------- |
| `delay(ms, msg)`          | one-shot                    | `time:delay`, `merge` (every delay fires)                     |
| `debounce(ms, msg, key?)` | one-shot                    | `time:debounce`, `switch` (each call cancels the pending one) |
| `periodic(ms, toMsg)`     | stream of 1, 2, 3…          | `time:periodic`, `switch`                                     |
| `animationFrames(toMsg)`  | stream of `{ time, delta }` | `time:frames`, `switch`                                       |

Debounce is a delay under `switch`, not a separate mechanism. Nothing starts at import, and
`animationFrames` falls back to a 16 ms timer where `requestAnimationFrame` is missing. Tests
use `virtualTime()` from `@gyral/testing`, which fakes `setTimeout`/`setInterval`/rAF.

**Delay-only apps (gyral-c5d.15, 0.3.1):** the driver is one `switch` over its inputs, so
`delay` alone bundles `periodic` and `animationFrames` too. `@gyral/time/delay` exports `delay`
and `debounce` with the same signatures and lanes over a delay-only driver (`delayTime`,
`makeDelayTime()`), also named `time` and taking the same input, so substitution, `inputsFor`
and virtual time work unchanged and either driver can stand in for the other. About 0.15 KiB
gzip less (the delay-only examples, measured). The main entry is unchanged.

## Randomness as an effect (gyral-czi.10, 2026-10-04)

Reducers request random numbers with a command instead of reading `Math.random()` in an
intent parser: `random(count, (values) => msg)` draws uniform numbers in [0, 1) from the
`random` driver (`randomDriver`, in core), and `randomInt(min, max, (n) => msg)` maps one to
an inclusive integer range via the pure `toInt(u, min, max)`. Models stay pure, and tests fix
the numbers by substituting the driver by name:
`el.drivers = { random: fakeDriver(randomDriver, { impl: ({ count }) => … }) }`.
http-random-user and many use it.

## Focus as a command (gyral-czi.28, 2026-10-04)

Moving focus is a side effect that drivers can't do: they have no access to a component's DOM.
`focus(selector, { preventScroll?, select? })` is a command that `define()` handles itself, like
`emit()` and `send()`. Once the update the reducer caused has rendered, it focuses the first
match in the component's own render root: its shadow root, or its children in light-DOM mode.
The element can therefore be one that the same update creates. Non-focusable targets such as
headings need `tabindex="-1"`. A selector that matches nothing logs a warning. It never runs on
the server. Typical uses are moving focus to a results heading after paging and to an input
after opening an editor.

## App-level request headers (gyral-ud5.9, 2026-10-04)

`makeHttpDriver({ headers })` adds default headers to every request through that driver:
a record, or a function evaluated when each request runs (it receives the request). Per-request
`headers` override them. `csrfFromMeta(name, header?)` is a ready-made source that reads
`<meta name=…>` at request time (empty on the server), so components and stores never read
the DOM: `el.drivers = { http: makeHttpDriver({ headers: csrfFromMeta('csrf-token') }) }`.
`submitForm` and `HttpRequest.csrf` use the same `csrfFromMeta` mechanism.

## Server-rendered page tests (gyral-czi.22, 2026-10-04)

`@gyral/testing` mounts golden SSR output the way a page load would: `mountSsr(html)` parses
Declarative Shadow DOM, applies only `<head>` styles (shadow-root styles stay in their roots),
restores the page-level store seed and named `<meta>`s, and records console errors, warnings and
uncaught errors from then on. `hydrated(page)` waits for every custom element under the page,
including those inside nested shadow roots, re-scanning until nested children have upgraded, and
throws if any problem was recorded (Lit's dev-mode banner excepted). `mountSsr(html, { stores:
false })` withholds the seed, to prove a test depends on it. Import component modules after
mounting so they hydrate in place.

**Server markup on demand (gyral-dyn.8, 0.3.1).** A browser test can't produce server markup:
in the browser `define()` registers elements instead of recording server specs, and client
builds drop the server segments of compiled templates. Golden fixtures are heavy for
component-level hydration tests, which then tend to become end-to-end tests. `@gyral/testing/vitest` exports `renderOnServer`, a
Vitest browser command (`test.browser.commands`, run in Vitest's Node process): given a module
(relative to the test file), an export and JSON props, it loads the module with the project's
Vite server in its `ssr` environment (module runner; same plugins and preset, development
condition) and renders it with the `@gyral/core/server` that the module's own `@gyral/core`
resolves to, so its components are registered with that renderer. The export may be a
`define()` class (its element, with props bound as properties), a function of the props
returning a template result, an HTML string or a `Response` (a full page), or a template result.
The browser test then runs `mountSsr(html)`, imports the module and awaits `hydrated(page)`.
`vitest` is an optional peer, used only by this entry, which is config-side: test files reach
the command through `commands` from `vitest/browser` (typed by the entry's module augmentation).
Modules stay loaded between calls, like a dev server. The testing package's
`render-on-server-hydration.test.ts` hydrates its output in the development and production
builds of core. Golden fixtures stay for markup from a whole server stack (routing, data
loading, a built server), for markup reviewed in diffs, and for other runners.

## Property tests from schemas (gyral-czi.11, 2026-10-04)

`@gyral/testing/arbitraries` (optional; needs `fast-check` 4) turns a Standard Schema into a
fast-check arbitrary: `arbitraryFrom(schema)`. It reads Standard JSON Schema when the library
implements it (Zod 4 does), or takes `{ toJsonSchema }` for libraries that don't yet (Valibot:
`@valibot/to-json-schema`). Generated values are filtered through the schema itself, so
refinements JSON Schema can't express still hold. `arbitraryFromJsonSchema(json)` is the
underlying generator (types, formats, ranges, patterns, enums, arrays, objects, unions, local
`$ref`s); unsupported keywords throw with a remedy. The community adapters were not used:
`zod-fast-check` supports only Zod 3 and fast-check 3, and `valibot-fast-check` is 0.1.

## Tree-scoped driver overrides (gyral-czi.35, 2026-10-04)

`el.drivers` substitutes drivers for one element only, so a client-rendered app's tests needed
a mutable registry wired into every component's `spec.drivers` (found in gyral-shop's admin).
A command's driver is now resolved in this order:

1. the element's own `el.drivers`;
2. the nearest **driver provider** above it, crossing shadow roots (an inner provider without
   that driver lets an outer one supply it);
3. the spec's `drivers`;
4. the command's own driver.

A provider is a `<gyral-drivers>` element with a `.drivers` property, or any element registered
with `provideDrivers(element, drivers)` (which returns a function that removes the overrides).
`@gyral/testing` wraps it as `withDrivers(root, drivers)`, so one call covers every component
in a test container or a `mountSsr(...).root`. Resolution happens each time a command runs, so
providers can change during a test. Commands never run on the server, so providers are not
consulted there.

## Faking http with real decoding (gyral-czi.36, 2026-10-05)

`fakeDriver(http)` skipped the request's `schema`, so wrong fake data reached the view and crashed
it instead of becoming a decode failure (gyral-shop's admin). `fakeHttp()` from
`@gyral/http/testing` is the real driver (`makeHttpDriver`) with a controllable `fetch`, so
schemas, `errorSchema`, status errors and JSON parsing behave exactly as in production:

```ts
import { fakeHttp } from '@gyral/http/testing';
const http = fakeHttp(); // or fakeHttp({ respond: (req) => ({ body }) }) to answer at once
el.drivers = { http }; // or withDrivers(root, { http })
http.requests; // HttpRequest inputs
http.respondNext({ body: { count: '42' } }); // decoded through the request's schema
http.respondNext({ status: 422, body: { … } }); // HttpStatusError, detail via errorSchema
http.failNext('offline'); // HttpNetworkError
```

It lives in `@gyral/http` (a `./testing` subpath) rather than `@gyral/testing`, because layer-1
packages may not import each other (ARCHITECTURE.md).

### `fakeHttp` ergonomics (2026-10-05)

From gyral-shop's admin tests:

- `http.inputs` is an alias of `http.requests`, matching `fakeDriver(…).inputs`.
- `http.reply(status, body?)` is shorthand for `respondNext({ status, body })`, e.g.
  `http.reply(422, problem)` or `http.reply(500)`.
- A `respond` option that throws or rejects is a bug in the test, not a network failure. The
  request still fails (the component sees `HttpNetworkError`, so it never hangs), and the error
  is reported as a `FakeHttpResponderError`: rethrown as an uncaught error by default, so
  Vitest fails the run, or passed to `onResponderError(error, request)` when given. All such
  errors are also kept in `http.responderErrors`. Simulate a real network failure with
  `failNext()` instead.

## Addendum: retries are a driver wrapper (ADR 0022, 0.3.1)

`Driver.retry` and `SubscriptionOptions.retry` are gone, and the interpreter runs a driver once.
`retry(driver, policy)` returns the same driver (same name, so substitution by name still
works) with a rejected `run` retried after the policy's delay; an abort ends it at once and is
never retried. `RetryPolicy` keeps its shape. Apps that never call `retry` don't bundle it.
The `retry` field in the `Driver` interface and the subscription options above describe 0.3.0.
On the http driver, a CSRF token from a `<meta>` is configured only through the driver's
`headers` (`csrfFromMeta`); `HttpRequest.csrf` is gone.

## Addendum: failures go through one channel (ADR 0024, 0.3.1)

A driver failure with no `onFailure` is reported as an error (G0041), not a warning, and a
throwing `onSuccess`/`onFailure` mapper is reported (G0040) and sends nothing; both send
`Errored` to the component (phase `command`). A reducer that throws for a command's result is an
update failure (G0073): the state is unchanged and the reducer's commands don't run. Store
commands report the same way, without a component. See ADR 0024 for the channel itself
(`GyralError`, the boundary event, `reportError`).
