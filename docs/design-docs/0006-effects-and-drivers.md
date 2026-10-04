# ADR 0006 — Effects as data, drivers as plain objects

Status: **accepted** (2026-10-04). Implements ADR 0002. Bead: gyral-czi.2.

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
2. the spec's `drivers` option (`define(tag, { drivers: { http: makeHttpDriver({...}) } })`);
3. the driver object on the command.

We chose this over a `@lit/context` provider because it needs no extra element, no
dependency, and works for a component tested in isolation. An ancestor-provided registry
(context) can be added later without changing this API; overrides would slot in at step 1.5.

### Lifecycle and runtime

- Each element owns an interpreter. Commands run as Effect fibers, forked through **one**
  internal runtime module (`packages/core/src/internal/runtime.ts`); nothing else calls
  `run*`.
- Cancellation: `AbortSignal` outside, fiber interruption inside (`Effect.tryPromise` links
  them). `switch` and `disconnectedCallback` interrupt in-flight fibers; their `signal`
  aborts, and their results are never dispatched.
- Retries use `Schedule` (`recurs` ∩ `spaced`/`exponential`). Only failures retry; interrupts
  never do.
- A driver failure becomes `onFailure(toError(cause))`, a message. Nothing is thrown into
  the view.

## Consequences

- Public types are plain TypeScript; Effect stays in `src/internal/` (checked).
- Debounce is "switch + delay": a timer driver with `concurrency: 'switch'` (see the
  http-search-github example). The time driver package (gyral-ud5.3) generalises this.
- Virtual time for retry/debounce tests lives in `@gyral/testing` (see Testing below).

## Testing (`@gyral/testing`, gyral-czi.7)

- **Pure:** `initial(spec, props?)`, `step(spec, state, msg, props?)` and
  `run(spec, msgs, { props?, state? })` return `{ state, commands }`, so tests never cast
  `Next`. Framework messages (`PropsChanged`, `IntentRejected`) step like any other.
  `inputsFor(commands, driver)`, `resolve(cmd, output)` and `reject(cmd, error)` drive the
  loop through a command's mappers with no DOM.
- **DOM:** `fakeDriver(driverOrName, { impl?, toError?, … })` records each call (input and
  `AbortSignal`) and waits for `resolveNext` / `rejectNext` (or `calls[i].resolve`). Errors
  pass through unchanged, so a test rejects with the already-typed error.
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
