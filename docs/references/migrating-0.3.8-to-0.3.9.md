# Behavior changes in 0.3.9

Gyral 0.3.9 fixes what migrating apps to 0.3.8 found (epic gyral-vge). Changes a working app can
notice come first, each with what to do; then new checks, then workarounds you can remove.

## Behavior changes

| Change                                                                                                                                                                       | Before 0.3.9                                                                                                                                                                                              | What to do                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Apps that install `@gyral/core` from npm run its development build in `vite dev` and Vitest's browser mode (gyral-3pv)                                                       | Vite's dependency optimizer pre-bundled core's production modules: no development checks (G0017, keys, impure rows, template rules, prop checks), coded messages                                          | Expect development warnings and errors you hadn't seen; each says what to change. Some checks throw (a duplicate key, a template rule), so a browser test that passed can fail: fix the cause it names |
| `gyralDevMiddleware` renders an edited component with its new spec on the next request (gyral-ejc)                                                                           | The dev server kept server-rendering the component's first definition until a restart; edits to plain server modules already showed                                                                       | Nothing; stop restarting the dev server after component edits                                                                                                                                          |
| `optimize: 'auto'` also scans the client build's inputs and every module in `components.modules` (gyral-5zi)                                                                 | Setting the scan entries replaced Vite's own (the client entry), and `components.modules` weren't scanned, so their imports were found mid-run: a reload, or Vitest's "Vite unexpectedly reloaded a test" | Nothing; remove a plugin that appended those files to `optimizeDeps.entries`                                                                                                                           |
| `npx @gyral/mcp skill` writes a `VERSION` file naming the release, and keeps owner files beside a copy (`LICENSE`, `NOTICE`, `COPYING`, `PINNED*`, `SOURCE*`) (gyral-337.18) | It deleted every file the skill doesn't ship, and `--check` failed on them                                                                                                                                | Run `npx @gyral/mcp@0.3.9 skill` once; `--check` compares `VERSION` too                                                                                                                                |

Details: ADR 0018's 0.3.9 addendum.

## Fixed checks

- **G0017 on pure views (gyral-nyy):** a skipped view is compared with what it rendered by
  value, not identity. Views that build values anew each render no longer warn:
  `each(s.items.map(…), …)`, `keyed(key, html…)`, `.data=${{ n: s.n }}`,
  `.items=${s.items.slice()}`. A `Date`, `Set` or class instance built in the view still
  compares by reference; reading `Date.now()`, a module variable or the DOM still warns.
- **G0017 says where (gyral-bn7):** "It differs in its template", or in `each(…, Row)` (the
  innermost list that differs, by its row function) or `keyed(…)`. When that list's pick
  returned a new object for the same item, it says to pick the fields the row reads or pass
  `each(items, key, row, { pick, equals })`.

- **Development messages name their code (gyral-99d):** each coded message ends with
  ` (G0017: https://gyral.dev/errors/#G0017)`, as production's `Gyral G0017 …` does; uncoded
  `gyral:` notices (such as a server-rendered element no client module defines) don't. Tests that
  match a development message exactly (`toBe`, `toEqual`) need the suffix, or match with
  `toContain`.

## Fixed

- **`on()` parsers test without a DOM (gyral-cd0):** `parse()` from `@gyral/testing` runs them
  in Node: it creates the parser's declared event type (`parse(C, 'Move', { key: 'ArrowLeft' })`)
  and takes `modifiers: { ctrl: true }`; key filters read the input's `key`, and `valueAsNumber`
  reads `value`. Without a DOM, `control`, `form` and `origin` are `undefined`.
- **`npx @gyral/mcp skill --dir <absolute path>` writes there (gyral-vbm),** not under the app.
- **`gyral/prefer-built-in` (gyral-um2):** `.focus()` in a driver warns only for an element
  reached through a component's `shadowRoot` or `renderRoot`; a page-level element the
  `focus()` command can't reach no longer warns.
- **`@gyral/codemod` (gyral-w2j, gyral-0dj):** it rewrites packages whose core is the version a
  release migrates from or newer (0.3.7 or 0.3.8 for `0.3.8`), before or after you install, and
  reports older packages once each. It also reports driver records and `subscription('name')`
  calls whose token lives in another module, instead of leaving them silently.
- **`ctx.props` is a stable reference (gyral-bn7):** the same object while no declared prop's
  value changes, a new one when one does. A pick that captures it (`(day) => ({ day, props })`)
  no longer re-renders every row on every render. Code that relied on a new object per read
  (mutating it) must copy it first.

## Workarounds you can remove

- `optimizeDeps: { rolldownOptions: { resolve: { conditionNames: […] } } }` in a Vite or Vitest
  config, added to get development checks in the dev server or browser tests: `gyral()` sets
  the conditions itself. One of your own still wins.
- A plugin that appends the client entry or `components.modules` files to
  `optimizeDeps.entries` after `gyral()` (gyral-5zi).
- Fake targets, stubbed `HTMLInputElement`/`Element` globals or browser-only tests for `on()`
  parsers, and `eslint-disable … gyral/prefer-built-in` directives that cite gyral-cd0: write the
  parser with `on()` and test it with `parse()`.
- `eslint-disable … gyral/prefer-built-in` directives on drivers that focus page-level elements
  (gyral-um2).
- Pin notes that record which release a vendored skill copy is: the copy's `VERSION` says it.
- Restarting the dev server after editing a component (gyral-ejc).
