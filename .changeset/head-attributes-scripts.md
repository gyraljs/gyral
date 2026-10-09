---
'@gyral/core': patch
'@gyral/ssr': patch
---

Head model: a `meta` entry may carry `media` (light and dark `theme-color` entries both stay), and
`renderPage({ headScripts })` writes inline scripts right after the managed head entries and
before any stylesheet, so a theme script runs before the page paints. `renderPage({ csp })` and
`contentSecurityPolicy({ scripts })` allow them in `script-src` by hash.
