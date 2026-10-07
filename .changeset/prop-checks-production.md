---
'@gyral/core': patch
---

Production bundles leave out the property path of props: property sets and hydration seeds keep
their value as given without going through the prop machinery (development still validates
them), about 30–50 B gzip in every app. The Vite preset also replaces the check of
`prop.value(check)`, which production never runs, with `void 0` in production client builds when
the check is a plain reference (`prop.value(Game)`, `schemas.game`) or an inline function, so the
check and the schema code only it uses tree-shake. Calls (`prop.value(v.array(Item))`),
`prop.json` checks and development builds are unchanged.
