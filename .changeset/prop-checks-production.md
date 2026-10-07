---
'@gyral/core': patch
---

Production bundles leave out the property path of props: property sets and hydration seeds keep
their value as given without going through the prop machinery (development still validates
them), about 30–50 B gzip in every app. The Vite preset also replaces the check of
`prop.value(check)`, which production never runs, with `void 0` in production client builds when
the check is a plain reference (`prop.value(Game)`, `schemas.game`) or an inline function, so the
check and the schema code only it uses can tree-shake. Whether they do is up to the bundler: in
Vite 8.3 (Rolldown), schema builders in a lazily loaded chunk are kept once the schema library
sits in a chunk shared with the entry, even when marked side-effect free, so the saving applies
to single-chunk builds and to schemas whose library isn't shared across chunks. Calls
(`prop.value(v.array(Item))`), `prop.json` checks and development builds are unchanged.
