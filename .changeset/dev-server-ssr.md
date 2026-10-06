---
'@gyral/core': patch
---

The Vite preset's new `gyral:dev-server` plugin makes server rendering under Vite's dev server
(`ssrLoadModule`) produce development output (`<!--gyral:ID-->` markers, development checks)
with installed packages too: in serve mode it keeps `@gyral/*`, and the app's dependencies that
depend on them, out of SSR externalization, so they resolve the `development` condition and
share one `@gyral/core`. `vite build` is unchanged.
