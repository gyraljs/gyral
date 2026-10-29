# Behavior changes in 0.3.8

Gyral 0.3.8 delivers the "Now" items of the 2026-10-28 ecosystem review (epic gyral-337) and a
full dependency update. Changes a working app can notice come first, each with what to do; then
new checks, then workarounds you can remove.

## Behavior changes

| Change                                                                                               | Before 0.3.8                                                                                                  | What to do                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A component renders only when its state, a declared prop or a declared store's value changes (337.1) | Every message rendered the view, even when `update` returned the same state; that render wrote nothing        | Nothing for a pure view. A view that reads anything else (`Date.now()`, a module variable, the DOM) stops refreshing on unrelated messages: move that into state, a prop or a store. Development warns once per component (G0017) |
| Gyral's packages take `@gyral/core` as a peer at their exact version (337.5)                         | Each listed core as a dependency, so a package of another version than the app's core installed a second core | Give every `@gyral/*` package the same version. pnpm now reports a mismatch at install time; npm stops with ERESOLVE. Overrides that only kept Gyral's packages on one core can go                                                |
| `gyralDevServer`'s `app` builds the handler once per server-module version (337.12)                  | It ran on every request                                                                                       | Nothing for most apps: per-request work belongs in the handler. Drop a cache of your own around `app`, such as starwars.run's per-module site cache                                                                               |

Details: ADR 0018's render-skipping addendum (the first), ADR 0033 (the second), ADR 0016's 0.3.8
addendum (the third).

## New checks and warnings

- **An `on()` parser reached by another event (G0018 in development; `gyral/intent-event` in
  ESLint's recommended config):** bind the intent to the parser's event.

- **A skipped view that renders differently (G0017, development):** the view reads something
  besides its state, props and stores.

- **Driver lists and records (G0044, G0045; development):** two drivers of one name in a list
  throw; a record key that isn't its driver's name warns, since commands of that driver never
  use it.
- **A Gyral package of another release than core (G0016):** each of `@gyral/devtools`, `http`,
  `router`, `ssr`, `testing` and `time` checks core's version when it loads. Development
  throws, naming both versions; production logs the coded warning.

## New APIs

- **`on(event, [filter], parser)`**: a parser typed by its event, with `control`, `form`,
  `modifiers`, `files`, `valueAsNumber` and `origin`, and a key filter.

- **`each(items, key, row, { pick, equals })`**: `equals` compares picked values, for a `pick`
  that builds a nested value each render.
- **`subscription(…, { select, equals, coalesce })`**: map each value, drop repeats, deliver the
  latest per microtask or frame.

- **`token.provide(run)` and `subscription(token, …)`**, with drivers supplied as a list:
  `provideDrivers(root, [session.provide(run), subscription(feed, listen)])`. The name comes from
  the token and `run` is typed by it. `el.drivers`, `<gyral-drivers>`, `mount({ drivers })` and
  stores take lists too; records keep working. `npx @gyral/codemod 0.3.8` rewrites records of
  tokens into lists.
- **`gyral()`** (`@gyral/core/vite`): `plugins: [gyral(), mine()]` replaces
  `...gyralVitePreset()` and the hand-merged `...preset.plugins`; the preset still works through
  0.3.x. `npx @gyral/codemod 0.3.8` rewrites it.
- **`optimize: 'auto'`**: pre-bundles what the modules defining components import, and a
  Vitest browser project's tests, at startup. On by default for a custom server (`gyralDevServer`).
- **`gyralDevMiddleware`** (`@gyral/ssr/node`): the dev server inside an Express, Connect or
  Fastify server of your own.

## Workarounds you can remove

- `instanceof KeyboardEvent` checks, hand-written modifier filters, `composedPath()[0]`,
  `Number(input.value)`, `closest('form')` and `files` lookups in parsers: `on()`.

- Hand-written guards against same-state renders (comparing fields before returning new state),
  subscription dedupe (`equals`), microtask batching of a source (`coalesce: 'microtask'`), and
  `JSON.stringify` equality for `each` picks (`equals`, after making references stable).

- Helpers that wrap a token and its implementation (gymtime's and containment's `implement`),
  and name-keyed records that repeat a token's name: `token.provide(run)` in a list.
- Lists of your Gyral libraries in `optimize` or `optimizeDeps.include`: the app's direct
  dependencies that use Gyral are pre-bundled with core.
- Import walkers that fill `optimizeDeps.include` (gyral-shop's `vite.deps.ts`): `optimize:
'auto'`.

- Install-time gates and overrides that kept Gyral's own packages on one copy of core, such as
  joystyk's `scripts/check-gyral.ts`. Keep an override for a third-party library that still
  pins core as a dependency, and ask its authors to make core a peer
  ([component-libraries.md](component-libraries.md)).
