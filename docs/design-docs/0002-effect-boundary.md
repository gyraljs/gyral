# ADR 0002 — Effect inside, plain TypeScript outside

Status: **superseded** by [ADR 0015](0015-runtime-size-spike.md) (2026-10-05). Gyral 0.2.0
has no Effect dependency: measurements showed Effect was most of a small app's JavaScript and
bought no runtime speed. The public-API half of this ADR still holds (plain TypeScript,
Promises, `AbortSignal`); `@gyral/effect` becomes an optional adapter for Effect users.
Originally accepted 2026-10-04.

## Context

We want Effect's runtime strengths (structured concurrency, interruption, retries via
`Schedule`, resource scopes and `TestClock`) without making users learn Effect.

Options considered:

- **A.** Effect as a private implementation detail.
- **B.** A, plus an opt-in `@gyral/effect` package.
- **C.** Effect only in tooling.
- **D.** Write our own small effect runtime.

## Decision

**B, built in two steps:** ship A as part of v0.1, then add `@gyral/effect` once the core is
stable (epic gyral-5zk).

Boundary rules (each enforced mechanically):

1. `effect` / `@effect/*` may only be imported in `packages/*/src/internal/**` (ESLint
   `no-restricted-imports`).
2. Published `.d.ts` files never mention Effect (`scripts/check-public-api.mjs`).
3. Errors cross the boundary as plain tagged unions (`{ _tag: 'HttpFailed', … }`). They have
   the same shape as `Data.TaggedError`, so `@gyral/effect` can expose them unchanged. Driver
   failures become messages; they are never thrown into the view.
4. Cancellation is `AbortSignal` outside and fiber interruption inside, scoped to the
   element's connect/disconnect lifecycle.
5. Validation accepts any Standard Schema (Zod, Valibot, ArkType, Effect Schema).
6. Concurrency is a named driver policy (`switch | merge | exhaust | queue`). This replaces
   picking between Rx's `switchMap`, `mergeMap` and friends by hand.
7. Test virtual time uses Effect's `TestClock` behind a plain API.

## Exceptions to the effect-fp-skill

That skill governs code inside `src/internal/` only. Outside it, these are intentional:

- The public API uses Promises, plain functions and plain objects. A library returning
  `Effect` from its public API (as the skill recommends) is exactly what we are avoiding.
- `effect` is a regular dependency of core (bundled into apps), not a peer dependency.
  `@gyral/effect` will peer-depend on the same range so service tags stay the same instance.

## Version

**4.x** from 0.2.0 (ADR 0015 decision addendum, 2026-10-05); 0.1.0 shipped on 3.x. Effect 4
renamed APIs the effect-fp-skill (written for 3.x) still uses; see AGENTS.md.
