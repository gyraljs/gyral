# ADR 0015 — Runtime size spike: Effect 3, Micro, Effect 4, or no Effect

Status: **proposed — decision pending owner** (2026-10-04). Beads: gyral-ob0 (bundle size),
gyral-d0x (Effect 4 evaluation), gyral-czi.9 (Effect adds ~40 kB).

## Question

ADR 0002 keeps Effect as a private implementation detail of the command interpreter
(`packages/core/src/internal/`). Adding Effect took the counter example from 7.2 kB to about
48 kB gzipped. What does each runtime option cost, does it still pass every test, and what
would the Effect 4 upgrade involve?

## Method

- `pnpm size` (`scripts/measure-bundles.mjs`) builds each example with Vite production
  settings (minified) and reports min, gzip (level 9) and brotli (quality 11) for all JS
  chunks. **effect (gz)** is the gzip size that disappears when `effect` is externalized.
- Each option was implemented on a throwaway branch as a drop-in replacement of
  `internal/interpreter.ts` (and `runtime.ts`), with the public API unchanged.
- Each was run against the **full test suite (359 tests)**. That includes the effects,
  concurrency (merge/switch/exhaust/queue), retry (fixed and exponential), streaming,
  cancellation-on-disconnect, store, SSR and all example tests.

## Results (sizes in KiB)

| Option                                   | counter gzip | http-search-github gzip | isomorphic client gzip | effect share (gz) | Tests   | Interpreter lines |
| ---------------------------------------- | -----------: | ----------------------: | ---------------------: | ----------------: | ------- | ----------------: |
| **(a)** Effect 3.22 full runtime (today) |         48.2 |                    52.3 |                   52.3 |              38.4 | 359/359 |               131 |
| **(b)** Effect 3.22 `effect/Micro`       |         15.0 |                    19.0 |                   18.9 |               5.1 | 359/359 |               123 |
| **(c)** Effect 4.0.1 full runtime        |         23.0 |                    27.1 |                   27.1 |              13.2 | 359/359 |               128 |
| **(d)** No Effect (hand-written)         |          9.8 |                    13.8 |                   13.9 |                 0 | 359/359 |               141 |

The brotli figures follow the same order: 42.7 / 13.6 / 20.8 / 8.9 for the counter. The rest
of each bundle is Lit plus Gyral (about 9.8 KiB gzipped for the counter). The full
per-example table for (a) comes from `pnpm size`.

## Notes per option

- **(a) Effect 3 full:** the status quo. Effect is about 80% of a small app's JavaScript.
- **(b) Micro:** a straight port; the APIs map one to one (`tryPromise` with signal,
  `retry` with `scheduleSpaced`/`scheduleExponential`/`scheduleRecurs`, fibers with
  `addObserver`/`unsafePoll`/`unsafeInterrupt`). Logging becomes `console` calls. No
  behaviour gaps were found, and the lack of `TestClock` doesn't matter because
  `@gyral/testing` uses fake timers.
  - **However, Micro is marked `@experimental` in 3.x and does not exist in Effect 4.** It
    is a dead end: upgrading to 4 later means porting again, to (c) or (d).
- **(c) Effect 4.0.1:** six mechanical changes to our code.
  - `Fiber.RuntimeFiber` → `Fiber.Fiber`
  - `unsafePoll() === null` → `pollUnsafe() === undefined`
  - `Schedule.intersect(recurs)` → `Effect.retry(attempt, { schedule, times })`
  - `catchAllDefect` → `catchDefect`
  - `zipRight` → `andThen`
  - `Fiber.await` → `Fiber.awaitAll([fiber])`

  The Effect 4 core is far smaller than 3.x: 13.2 vs 38.4 KiB here.

- **(d) No Effect:** 141 lines. Lanes keyed by command, an `AbortController` per task,
  retries with timers that cancel on abort, queue via the previous task's promise. It is the
  smallest and has no dependency. The spike code still has 4 lint errors (style rules) to
  fix.
  - **It gives up ADR 0002's premise.** The owner chose "underlying code uses Effect, users
    are never bound to it" (option B of the Effect discussion).

## Effect 4 upgrade assessment (gyral-d0x)

- **Status:** 4.0.0 was released on 2026-10-01, and 4.0.1 a few days later. It is very new;
  expect point releases.
- **Breaking changes that affect Gyral:** only the six listed under (c), all inside
  `packages/core/src/internal/`. No public API changes (ADR 0002 boundary held).
  `@gyral/effect` (planned, gyral-5zk) would peer-depend on 4.x.
- **Effort:** under an hour for core. The `effect-fp-skill` targets 3.x and would need a 4.x
  update before writing more Effect code.
- **Size:** −25 KiB gzipped on every app (48.2 → 23.0 for the counter).

## Recommendation

**(c): upgrade to Effect 4 and keep the full runtime.**

- It keeps the owner's decision that Gyral's internals use Effect.
- It halves the cost of every app.
- It stays on the supported major line, so we don't invest in Micro, which is experimental
  in 3.x and gone in 4.

Choose **(d)** only if the owner sets a hard budget below about 15 KiB gzipped for a minimal
app. It costs about 13 KiB less than (c), but reverses ADR 0002. **Avoid (b).**

## Decision

_Pending the owner._ If (c) is chosen: apply the spike's six-line port, pin
`effect@^4.0.1`, update ADR 0002's "Version" section, and set a size budget in
`pnpm size` (for example, counter ≤ 25 KiB gzipped).
