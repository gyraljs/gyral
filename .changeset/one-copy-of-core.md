---
'@gyral/core': patch
---

Keep an app on one copy of `@gyral/core` (gyral-k97.2). A second copy fails far from the cause:
a stylesheet one copy made crashed the other with `styles.flatMap is not a function`.

- `gyralVitePreset()` now pre-bundles the browser entry points of every Gyral package installed
  for the app, in the dev server and Vitest, so Vite no longer bundles a second copy of core for
  a Gyral package it meets partway through a run ("Vite unexpectedly reloaded a test"). Remove
  Gyral's packages from your `optimize` list; keep other dependencies there.
- The preset warns once, in dev and builds, when `@gyral/core` is installed more than once,
  naming each copy's version, folder and the packages that use it, and how to pin one version.
- Development builds warn in the browser when a page runs a second copy of core (G0015).
