# ADR 0015 — Runtime size spike: Effect 3, Micro, Effect 4, or no Effect

Status: **accepted — (d) no Effect from 0.2.0** (owner, 2026-10-05; see the final decision at
the end). 0.1.0 shipped on (a) Effect 3; the interim Effect 4 decision below was superseded the
same day by measurements. Proposed 2026-10-04. Beads: gyral-ob0 (bundle size), gyral-d0x
(Effect 4 evaluation), gyral-czi.9 (Effect adds ~40 kB), gyral-das, gyral-qh4, gyral-pr7,
gyral-sug.

> **Superseded in part by [ADR 0018](0018-view-layer.md)** (2026-10-06, shipped in 0.3.0): the `lit-html` 3.3.0 pin ended when Lit was removed. Lit-specific text below describes 0.2.x.

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

**(a): Gyral 0.1.0 ships on the Effect 3 full runtime** (owner, 2026-10-05; bead gyral-i7g.7).
The recommendation above was (c); the owner chose to stay on 3.x for the first release.

- **Why:** Effect 3 is the stable, current and most adopted line. 4.0 was days old when
  0.1.0 was cut, and the first public release should not ride a new major.
- **Cost accepted for 0.1:** about 48 KiB gzipped for a minimal app (counter), of which about
  38 KiB is Effect. The table above stays the reference.
- **No runtime code changes.** ADR 0002's boundary means a later switch is internal to
  `packages/core/src/internal/` and invisible to users.
- **Effect 4** remains the expected next step: gyral-d0x tracks the upgrade (the six changes
  under (c)), to be scheduled when 4.x has settled.
- The spike branches `spike/effect4`, `spike/micro` and `spike/no-effect` are kept as
  reference; they are not merged.

## Addendum: measured against other frameworks (2026-10-05)

The baseline benchmark (gyral-7se.9; repo `gyraljs/benchmarks`, run `results/2026-10-05`,
harness `0ccf82a`) measured Gyral 0.1.0 on Effect 3 next to six frameworks, each app
written the way that framework's docs recommend and checked by one shared correctness spec.

|                                          | Solid | Preact |  Lit | Svelte |  Vue | Gyral | React |
| ---------------------------------------- | ----: | -----: | ---: | -----: | ---: | ----: | ----: |
| JS gzip KiB, empty app                   |   3.7 |    4.7 |  5.8 |    9.0 | 23.0 |  49.3 |  66.1 |
| JS gzip KiB, todo app                    |   6.6 |    6.1 |  7.3 |   14.2 | 25.0 |  51.0 |  66.6 |
| Todo interactive, cold, throttled (ms)   |   450 |    445 |  438 |    475 |  533 |   725 |   801 |
| Table runtime, geometric mean vs fastest |  1.07 |   1.61 | 3.09 |   1.30 | 1.43 |  3.03 |  1.90 |
| JS heap after load (MB)                  |  1.13 |   1.17 | 1.20 |   1.19 | 1.32 |  1.71 |  1.55 |

- **Runtime overhead of MVI is negligible:** Gyral is within 4% of plain Lit on 6 of 9 table
  operations.
- **Size and startup are the Effect 3 runtime** (about 38 of 49 KiB). Gyral is second
  largest and starts about 280 ms after Lit, Preact and Solid.
- **Lit and Gyral's table score is mostly the lit-html 3.3.1+ leak** (gyral-9y6): clear 1,000
  rows took about 3,746 ms vs 26-40 ms elsewhere, 56 ms on lit-html 3.3.0.
- **Caveat:** timing ends at the next rendered frame, so differences under about 17 ms are
  not meaningful; trace-based timing is required before publishing (gyral-7se.12).

The owner chose to benchmark the current runtime before revisiting this decision. Next step:
benchmark an Effect 4 build with the same harness (`pnpm bench --only=gyral,lit`).

## Decision addendum: Effect 4 and the lit-html 3.3.0 pin (2026-10-05)

**The owner adopts option (c), Effect 4 (4.0.1 or later), together with the lit-html 3.3.0
pin**, after testing branch `exp/lit330-effect4` (bead gyral-bu6). They ship in **0.2.0**;
until that release the change lives on the branch. This supersedes the Effect 3 decision
above for 0.2.0 onwards.

- **Code change:** the six mechanical changes under (c), applied to the interpreter as it is
  now (it gained devtools tracing after the spike). No public API change: check-public-api,
  all tests, `smoke:prod` and pack:check pass.
- **Size (`pnpm size`, gzip):** counter 49.5 -> 24.3 KiB (Effect itself 13.2),
  http-search-github 53.7 -> 28.4, isomorphic 54.8 -> 29.5.
- **Benchmark** (repo gyraljs/benchmarks, branch `exp/lit330-effect4`,
  `results/2026-10-05-lit-html-3.3.0-effect4/COMPARISON.md`). A = 0.1.0 (Effect 3, lit-html
  3.3.3); B = A + lit-html 3.3.0; C = B + Effect 4:

  | Within each run                           |     A |    B |    C |
  | ----------------------------------------- | ----: | ---: | ---: |
  | Gyral / Lit, table runtime geometric mean |  1.00 | 1.01 | 1.02 |
  | Startup gap to Lit, todo app (ms)         |  +286 | +254 | +109 |
  | JS heap after load, Gyral (MB; Lit 1.20)  |  1.71 | 1.71 | 1.36 |
  | Clear 1,000 rows, Gyral (ms)              | 3,746 |   56 |   46 |
  | Replace 1,000 rows, Gyral (ms)            | 2,231 |  414 |  373 |
  | JS gzip, todo app (KiB)                   |  51.0 | 51.0 | 25.8 |

  The pin fixes the list leak (gyral-9y6); Effect 4 halves the bundle and cuts the startup
  gap to Lit by about 175 ms; runtime relative to Lit is unchanged.

- **Caveat:** the machine ran 10-15% faster during run C (every unchanged framework sped up
  by that much), so compare Gyral with Lit within a run, not raw milliseconds across runs.
  Timing ends at the next rendered frame, so differences under about 17 ms are noise; publish
  only after trace-based timing (gyral-7se.12).
- **Still open:** Gyral remains 3-4x the JavaScript of Lit, Preact or Solid, and Effect 4 is
  about 13 of its 24 KiB. Option (d) is the only way below that; revisit with the published
  benchmark.

## Final decision: no Effect from 0.2.0 (2026-10-05)

**The owner adopts option (d), the hand-written runtime with no Effect, together with the
lit-html 3.3.0 pin and template whitespace minification (gyral-9rf), for 0.2.0.** This
supersedes the Effect 4 addendum above and ADR 0002. Branch `release/0.2.0` combines
`exp/no-effect` and `exp/whitespace` (bead gyral-sug). Full write-up: the runtime report
(https://claude.ai/artifact/4EADFNaSvmGg25wbiKR5Pz, private to the owner).

- **Runtime:** one `AbortController` per task, retry schedules as timers that cancel on
  abort, `queue` chained on the previous task's promise, devtools `interrupted` from the abort
  listener. 214 lines in `packages/core/src/internal/interpreter.ts`; `effect` is no longer a
  dependency of any package, and `internal/runtime.ts` is gone. All lane, retry, streaming,
  cancellation and devtools tests pass unchanged; the public API is identical.
- **Why (d) over the alternatives,** all measured in one trace-timed session
  (gyraljs/benchmarks branch `exp/pipewise`, `results/2026-10-05-all-runtimes-trace-a3/`):

  | Option               | Empty app (KiB gzip) | Todo interactive (ms) | Heap (MB) | Table geomean |
  | -------------------- | -------------------: | --------------------: | --------: | ------------: |
  | Effect 4             |                 24.0 |                 521.9 |      1.36 |          1.35 |
  | **No Effect**        |             **10.8** |             **438.4** |  **1.24** |      **1.34** |
  | two-track            |                 11.1 |                 444.5 |      1.24 |          1.36 |
  | pipewise             |                 12.3 |                 441.9 |      1.24 |          1.35 |
  | pipewise + two-track |                 12.7 |                 449.1 |      1.24 |          1.36 |
  | Lit (reference)      |                  5.8 |                 408.8 |      1.20 |          1.34 |

  Rendering speed is the same for every option (the interpreter only runs for commands), so
  the choice is size, startup and maintenance. (d) is the smallest, starts fastest, adds no
  dependency and keeps synchronous driver start.

- **Not chosen, with the condition to revisit:**
  - **pipewise** (best-tested lane semantics): when Gyral adds stream-shaped features and
    pipewise is on npm with exponential backoff and exhaust-drop reporting.
  - **two-track:** as a public `Result` type for `@gyral/http` and forms, once published with
    its retry-after-abort bug fixed.
  - **Effect:** `@gyral/effect` (gyral-5zk) becomes an optional adapter for apps that use
    Effect, built on demand; Gyral itself has no Effect dependency.
- **What we now own:** interruption, retry timing and task tracking, about 214 lines, covered
  by the existing tests. Effect's scheduler is no longer available for future features.
- **Confirmation:** the combined candidate is benchmarked as one build before release
  (gyral-sug; `gyraljs/benchmarks` branch `exp/release-0.2.0`, `CONFIRMATION.md`).
