# ADR 0017 — Devtools: a dev-only event stream and an in-page panel

Status: **accepted** (2026-10-04). Beads: gyral-7ld.1 (hook), gyral-7ld.2 (panel).

## Context

Gyral's loop is data all the way through (intent → message → reducer → state + commands →
drivers → messages), so a timeline of what happened is cheap to produce and very useful. It
must cost nothing in production and almost nothing in development when no panel is open.

## Decision

### The hook (core)

- Events (`DevEvent`, `packages/core/src/devtools-events.ts`), each with `at`
  (`performance.now()`):
  - `connect` / `disconnect`: a component instance (`{ tag, id, element }`).
  - `hydrated`: after the first update, with `serverRendered`.
  - `update`: a message went through a reducer, with `prev` and `next` state.
  - `command`: `issued`, `dropped` (exhaust), `interrupted` (switch, disconnect), `settled`
    (with the driver's output) or `failed` (with its error), plus driver, lane, policy, input
    and owner (`<tag>#id` or `store:name`).
  - `store`: a store message with `prev` and `next`.
- A listener installs itself as `globalThis.__GYRAL_DEVTOOLS__ = { emit(event) }`
  (`DEVTOOLS_GLOBAL`). Without a listener, the emit helpers return before building an event.
- **Stripped from production builds.** Core imports `#devtools`, a package-internal import with
  a `development` condition (`src/devtools.ts`) and a `default` (`src/devtools-off.ts`, the
  same names as no-ops, signatures tied with `typeof`). Every call site is guarded by
  `if (DEVTOOLS_ENABLED)`, a literal `false` in the production module, so bundlers drop the
  call sites and the module. Vite resolves `development` in dev and Vitest, `production` in
  `vite build`; other tools get the safe default (off).
- Measured with `pnpm size` before and after: counter 150.2 KiB min / 49.3 KiB gzip both
  times; the largest change across all examples was +0.1 KiB (a few `void 0` arguments). A
  production build contains neither the global name nor the listener code.
- `devtoolsEnabled` is exported so a panel can say "events only flow in development builds".

### The panel (`@gyral/devtools`)

A separate package (gyral-7ld.2), so apps never ship it unless they import it.

## Consequences

- Instrumentation lives at the few places the loop already passes through: `define()`'s
  dispatch, connect and first update; the store's `send`; the interpreter's run/settle/fail.
- Event payloads hold live references (elements, state objects). The panel must not mutate
  them and should stringify for display.
- Non-Vite bundlers that don't set the `development` condition get no events. Configure the
  condition (`resolve.conditions`) to enable them.
