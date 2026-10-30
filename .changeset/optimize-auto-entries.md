---
'@gyral/core': patch
---

`optimize: 'auto'` now also scans the client build's inputs and the modules in
`components.modules` (gyral-5zi). Before, setting `optimizeDeps.entries` replaced Vite's own
start point, `build.rollupOptions.input` (or `rolldownOptions.input`, or `input`), and the
component scan can't see a component defined through a wrapper. A package imported only by the
client entry or such a module was found mid-run: the dev server reloaded ("new dependencies
found") and Vitest printed "Vite unexpectedly reloaded a test". If your config appends those
modules to `optimizeDeps.entries` after `gyral()` as a workaround (gyral-shop's
`scanEntries()`), you can remove it.
