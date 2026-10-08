# ADR 0022 — `@gyral/http` and retries: pay only for what the app uses

Status: **proposed** (2026-10-08), for **0.3.1**. Bead: gyral-o4q (from the size investigation
gyral-c5d.10, cuts G6 and G7). Builds on ADR 0006 (commands, drivers, retry), ADR 0008
(forms: `submitForm` and 422 `IntentRejected`) and view/05-element.md "Features register
themselves".

**Scope note (owner, 2026-10-08):** the 0.4 items ship in 0.3.1, and breaking a 0.3.0 API is
acceptable this once (0.3.0 is not yet approved on npm). This ADR therefore recommends the
cleanest design rather than a compatible one, and lists what breaks.

## Context

Every app that imports `get` or `request` from `@gyral/http` bundles three features whether
it uses them or not:

| Feature                                                                                    | Where                                                                              | Used by                                                               |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **CSRF from `<meta>`**: a per-request `csrf: { meta, header? }` field and `csrfFromMeta()` | `driver.ts` `run()` always reaches `csrfFromMeta` for `req.csrf`                   | Apps with cookie sessions that post; `submitForm({ csrf: { meta } })` |
| **Error bodies**: `errorSchema` decodes a non-2xx body into `HttpStatusError.detail`       | `driver.ts` `statusError()`                                                        | `submitForm` (422 → `IntentRejected`), apps with typed API errors     |
| **Retry**: `Driver.retry` (`{ times, delayMs, backoff }`)                                  | **core's** interpreter (`attemptWithRetry`, `sleep`, `delayFor`), for every driver | Drivers and subscriptions given `retry` (socket reconnects)           |

Measured for this ADR (esbuild, minified, gzip level 9, each module alone; inside an app the
savings are a little smaller, because they compress with the rest):

| Cut                                      | Saving alone | c5d.10 estimate inside an app |
| ---------------------------------------- | ------------ | ----------------------------- |
| CSRF handling out of the driver          | 116 B        | ≈ 0.1 KiB                     |
| `errorSchema` decoding out of the driver | 37 B         | ≈ 0.03 KiB                    |
| Retry out of the interpreter             | 156 B        | ≈ 0.11 KiB                    |

CSRF also has **two ways to do one thing**: the per-request `csrf` field, and the driver's
`headers: csrfFromMeta('csrf-token')`, which the docs already recommend as the app-level way
(a token is an app concern, not a component's).

## Options

| Option                                                                                                       | Verdict                                                                                                            |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| A. Make all three opt-in flags (`withCsrf()`, `withErrorSchema()`)                                           | A flag that silently does nothing when forgotten is the wrong failure mode for CSRF                                |
| B. A lean entry, `@gyral/http/lean`, without CSRF and error bodies                                           | A second entry to document and choose; can't reach retry, which is in core                                         |
| C. Detect the names at build time (0.3.1's spec-field scan) and fail closed for CSRF                         | Compatible, but adds three names to the scan, needs Gyral's own pass-throughs excluded, and has run-time-name gaps |
| **D. One explicit way each: CSRF only through header sources, retry as a driver wrapper; error bodies stay** | **Recommended.** Each feature is reached by calling it, so tree-shaking does the rest; no scan, no gaps            |

## Decision (recommended): option D

### CSRF: configured once, on the driver

- **Removed:** `HttpRequest.csrf` and `submitForm`'s `csrf: { meta, header? }`.
- **The one way:** `makeHttpDriver({ headers: csrfFromMeta('csrf-token') })`, given to the app
  with `provideDrivers` or a component's `drivers` (already documented). `csrfFromMeta` reads
  the `<meta>` when each request runs, so reducers stay pure. `submitForm({ csrf: { token } })`
  stays for a token the app already holds (no DOM read).
- `run()` no longer mentions CSRF: header sources were already resolved per request, so the
  driver shrinks and `csrfFromMeta` is bundled only by apps that call it.

```ts
// app entry
provideDrivers(document.body, { http: makeHttpDriver({ headers: csrfFromMeta('csrf-token') }) });

// component: no csrf option any more
Register: (s, m) => [{ ...s, busy: true }, [submitForm('/register', m.form, { onSuccess, onFailure })]],
```

**Safety:** an app that upgrades and forgets the driver setting sends no token, and its
server answers 403, as it would for any missing token: the server stays the enforcer. To catch
it before deploy, development builds warn once when a non-GET request goes out while the page
has a `<meta name="csrf-token">` (or `name="csrf"`) and the driver added no header from it.

### Retry: a driver wrapper in core

- **Removed:** `Driver.retry`, `SubscriptionOptions.retry`, `HttpDriverOptions.retry` and the
  `retry` options of `@gyral/testing`'s and `@gyral/http/testing`'s fakes. The interpreter
  runs a driver once.
- **Added:** `retry(driver, policy)` in `@gyral/core`, returning a driver with the same name
  whose `run` retries a rejection after the policy's delay (fixed or exponential), stops when
  the command's signal aborts (switched away, disconnected), and never retries an abort.
  `RetryPolicy` keeps its shape.

```ts
const api = retry(makeHttpDriver({ baseUrl: '/api' }), {
  times: 2,
  delayMs: 300,
  backoff: 'exponential',
});
const feed = retry(subscription('feed', connect), { times: Infinity, delayMs: 1000 }); // reconnects
```

- Apps that never call `retry` don't bundle it, whatever drivers they use: about 0.1 KiB off
  every app with commands, not only `@gyral/http` users.
- Wrapping keeps retry where the driver is chosen (app setup, test fakes), which is already
  where policies live; a component can't ask for retries per command today either.
- Streaming drivers work unchanged: the wrapper calls `run` again with the same `emit` and
  `signal`, which is what the interpreter's loop did.

### Error bodies: keep them

`errorSchema` costs 37 B, `submitForm` needs it for every 422, and making it a call would only
move the bytes into `request()`. No change.

## Breaking changes (0.3.0 → 0.3.1)

| Removed                                                   | Replace with                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `request({ csrf: { meta, header } })`                     | `makeHttpDriver({ headers: csrfFromMeta(meta, header) })` once for the app |
| `submitForm(url, data, { csrf: { meta } })`               | the same driver setting; `{ csrf: { token } }` still works                 |
| `Driver.retry`, `defineDriver({ retry })`-style objects   | `retry(driver, policy)`                                                    |
| `makeHttpDriver({ retry })`, `subscription(…, { retry })` | `retry(makeHttpDriver(…), policy)`, `retry(subscription(…), policy)`       |
| `retry` option of the testing fakes                       | `retry(fake, policy)`                                                      |

All are compile errors (unknown properties), so the type checker finds every site.

## Implementation plan (0.3.1)

| Step | Files                                                                                                                                                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `packages/core/src/retry.ts` (new: `retry()`, its `sleep`), `command.ts` (drop `Driver.retry`), `internal/interpreter.ts` (single attempt), `subscription.ts` (drop the option), `index.ts`                                  |
| 2    | `packages/http/src/driver.ts` (drop `csrf` field and `retry` option; dev warning), `forms.ts` (`csrf: { token }` only), `index.ts`, `testing.ts`; `packages/testing/src/fake.ts`                                             |
| 3    | Examples using `submitForm` with a meta token (register, no-js-first) move it to the driver; `create-gyral` templates if they show it                                                                                        |
| 4    | Docs: ADR 0006 and 0008 addenda pointing here; skill `effects-and-drivers.md`, `forms.md`, `outside-stores.md`; `packages/http/README.md`; `docs/references/migrating-0.2-to-0.3.md` gets a 0.3.0 → 0.3.1 section; changeset |

**Tests:**

- core: `retry()` with virtual time: fixed and exponential delays, `times` reached then
  `onFailure`, abort during a delay ends it with no further attempt, a switched-away command
  stops retrying, a streaming subscription re-subscribes after a failure; the interpreter no
  longer retries a plain driver.
- http: no CSRF header unless a header source adds it; `csrfFromMeta` on the driver; the dev
  warning fires for a POST with a token `<meta>` and no header, and not for GET or when the
  header is present; `submitForm` with `{ token }`; the 422 → `IntentRejected` path unchanged.
- Bundle check: a fixture app using only `get()` contains neither `csrfFromMeta`'s selector
  string nor the retry delay code.
- `pnpm size`, `smoke:prod` (register, no-js-first).

**Size:** −0.2 to −0.25 KiB gzip for apps that only fetch (http-random-user,
http-search-github, autocomplete-search); about −0.1 KiB for every app that runs commands but
doesn't call `retry`; apps that use `retry` and `csrfFromMeta` stay within ±30 B. Budgets
lowered to measured + 0.1 KiB.

## Baseline and compatibility

No browser features involved (`fetch`, `AbortSignal` and timers are widely available). The
breaking changes are listed above; nothing else in `@gyral/http` changes.

## Open questions for the owner

1. **CSRF API.** (a) Driver header sources only (recommended); (b) keep the per-request field
   too; (c) build-time detection, compatible (option C).
2. **Retry API.** (a) `retry(driver, policy)` wrapper (recommended); (b) keep `Driver.retry`
   and register it by build-time name detection.
3. **Missing-token dev warning.** (a) Warn on non-GET requests when a CSRF `<meta>` exists and
   no header came from it (recommended); (b) no warning, document only.
