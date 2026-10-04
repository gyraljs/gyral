# ADR 0002 — Effect inside, plain TypeScript outside

Status: **accepted** (2026-10-04)

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

Pinned to the **3.x** line. Effect 4.0.0 is now published on npm, so tracking the upgrade is
bead gyral-d0x. The bundle-size spike runs after v0.1.
