# ADR 0033 — Core as an exact-version peer of Gyral's packages

Status: **accepted**, 0.3.8. Bead: gyral-337.5; decides gyral-49t.16. Owner's decision,
2026-10-29.

`@gyral/devtools`, `http`, `router`, `ssr`, `testing` and `time` depended on `@gyral/core` at
their release's exact version. When an app's core was another version, the package manager
installed a second core for that package without a word, and the app failed far from the
cause (`styles.flatMap is not a function`, G0015). joystyk carried overrides and an 81-line
gate (`scripts/check-gyral.ts`) against it.

## Decision

- **Gyral's packages take core as a peer at their own exact version.** Each lists
  `@gyral/core` at `workspace:*` in `peerDependencies`, which pnpm publishes as the release's
  version (`0.3.8`), and in `devDependencies` for the workspace. They import
  `@gyral/core/internal`, which semver doesn't cover, so only the core of their own release is
  safe. A package manager then never installs a second core for them: the app's copy is used,
  and a mismatch shows at install time. pnpm reports the unmet peer with both versions; npm
  stops with ERESOLVE. pnpm and npm install a missing peer themselves; apps list
  `@gyral/core` anyway. Angular's packages declare `@angular/core` the same way.
- **Each package checks core when it loads** (`requireCore(name, VERSION)` from
  `@gyral/core/internal`, called by `src/core.ts`, which every entry point that loads core
  imports and `sideEffects` lists). Another release throws G0016 in development, naming both
  versions; production logs the coded warning.
- **Third-party libraries** list core as a caret peer (`"^0.3.8"`) and import public entry
  points only ([component-libraries.md](../references/component-libraries.md)).

The changesets `fixed` group keeps every package on one version. With exact peers it still
bumps them together, without the forced major that peer changes can cause: a core patch took
all packages to 0.3.8 and a minor to 0.4.0 (dry run in a scratch worktree, 2026-10-29).

## Enforcement

- `checkDependencies` (`pnpm invariants`) rejects `@gyral/core` as a dependency, or as a peer
  other than `workspace:*`, in any package but core.
- `pnpm pack:check` checks each packed peer is the exact release version, then installs the
  packed core and http into a throwaway app: at the same release, and with core repacked at
  another version. Both must give one copy of core; the mismatch must make pnpm report the
  unmet peer (`pnpm peers check`: pnpm 11 and later only warn during the install). The 0.3.7
  packages, which depended on core, installed two copies there and said nothing.
- A test checks that every entry point that loads core imports `./core.js` and that
  `sideEffects` keeps it; `check-plugin-version.mjs` keeps each package's `VERSION` at the
  release.
