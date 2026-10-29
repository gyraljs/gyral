# Behavior changes in 0.3.8

Gyral 0.3.8 delivers the "Now" items of the 2026-10-28 ecosystem review (epic gyral-337) and a
full dependency update. Changes a working app can notice come first, each with what to do; then
new checks, then workarounds you can remove.

## Behavior changes

| Change                                                                              | Before 0.3.8                                                                                                  | What to do                                                                                                                                                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gyral's packages take `@gyral/core` as a peer at their exact version (337.5)        | Each listed core as a dependency, so a package of another version than the app's core installed a second core | Give every `@gyral/*` package the same version. pnpm now reports a mismatch at install time; npm stops with ERESOLVE. Overrides that only kept Gyral's packages on one core can go |
| `gyralDevServer`'s `app` builds the handler once per server-module version (337.12) | It ran on every request                                                                                       | Nothing for most apps: per-request work belongs in the handler. Drop a cache of your own around `app`, such as starwars.run's per-module site cache                                |

Details: ADR 0033 (the first), ADR 0016's 0.3.8 addendum (the second).

## New checks and warnings

- **A Gyral package of another release than core (G0016):** each of `@gyral/devtools`, `http`,
  `router`, `ssr`, `testing` and `time` checks core's version when it loads. Development
  throws, naming both versions; production logs the coded warning.

## New APIs

- **`gyral()`** (`@gyral/core/vite`): `plugins: [gyral(), mine()]` replaces
  `...gyralVitePreset()` and the hand-merged `...preset.plugins`; the preset still works through
  0.3.x. `npx @gyral/codemod 0.3.8` rewrites it.
- **`optimize: 'auto'`**: pre-bundles what the modules defining components import, and a
  Vitest browser project's tests, at startup. On by default for a custom server (`gyralDevServer`).
- **`gyralDevMiddleware`** (`@gyral/ssr/node`): the dev server inside an Express, Connect or
  Fastify server of your own.

## Workarounds you can remove

- Lists of your Gyral libraries in `optimize` or `optimizeDeps.include`: the app's direct
  dependencies that use Gyral are pre-bundled with core.
- Import walkers that fill `optimizeDeps.include` (gyral-shop's `vite.deps.ts`): `optimize:
'auto'`.

- Install-time gates and overrides that kept Gyral's own packages on one copy of core, such as
  joystyk's `scripts/check-gyral.ts`. Keep an override for a third-party library that still
  pins core as a dependency, and ask its authors to make core a peer
  ([component-libraries.md](component-libraries.md)).
