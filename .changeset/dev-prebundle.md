---
'@gyral/core': patch
---

Apps that install `@gyral/core` from npm now run its development build in `vite dev` and in
Vitest's browser mode (gyral-3pv). Until now Vite's dependency optimizer pre-bundled core's
production modules there, so none of Gyral's development checks ran (G0017, duplicate keys,
impure `each` rows, template rules, prop checks) and messages printed as codes. Expect warnings
and errors you hadn't seen; some throw, so a browser test that passed can fail, naming what to
fix. Gyral's own examples and Node-environment tests were not affected.

`gyral()` (and `gyralVitePreset()`) now gives the optimizer the environment's resolve
conditions in serve mode: your `resolve.conditions`, or Vite's defaults with `development`.
Production builds are unchanged. Remove an
`optimizeDeps.rolldownOptions.resolve.conditionNames` workaround; one of your own still wins.
