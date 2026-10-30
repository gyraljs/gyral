# Behavior changes in 0.3.9

Gyral 0.3.9 fixes what migrating apps to 0.3.8 found (epic gyral-vge). Changes a working app can
notice come first, each with what to do; then new checks, then workarounds you can remove.

## Behavior changes

| Change                                                                                                                 | Before 0.3.9                                                                                                                                                     | What to do                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Apps that install `@gyral/core` from npm run its development build in `vite dev` and Vitest's browser mode (gyral-3pv) | Vite's dependency optimizer pre-bundled core's production modules: no development checks (G0017, keys, impure rows, template rules, prop checks), coded messages | Expect development warnings and errors you hadn't seen; each says what to change. Some checks throw (a duplicate key, a template rule), so a browser test that passed can fail: fix the cause it names |

Details: ADR 0018's 0.3.9 addendum.

## Fixed checks

- **G0017 on pure views (gyral-nyy):** a skipped view is compared with what it rendered by
  value, not identity. Views that build values anew each render no longer warn:
  `each(s.items.map(…), …)`, `keyed(key, html…)`, `.data=${{ n: s.n }}`,
  `.items=${s.items.slice()}`. A `Date`, `Set` or class instance built in the view still
  compares by reference; reading `Date.now()`, a module variable or the DOM still warns.

## Workarounds you can remove

- `optimizeDeps: { rolldownOptions: { resolve: { conditionNames: […] } } }` in a Vite or Vitest
  config, added to get development checks in the dev server or browser tests: `gyral()` sets
  the conditions itself. One of your own still wins.
