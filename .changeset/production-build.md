---
'@gyral/core': patch
'@gyral/ssr': patch
---

Browser bundles built without Vite get no development code (gyral-gpr). Core's development
checks were guarded by a flag that only Rollup-based bundlers (Vite) resolve across modules, so
esbuild, webpack, Rspack, Parcel and Bun kept every check and the modules only they use as dead code in
production: 17 to 19 KB minified in a small app, the template rule 15 element list, the
undefined-tag watch and the skipped-view recheck included. `@gyral/core` now also ships a
production build, `dist/prod/`, with that code removed when Gyral is built, and its exports send
the `browser` condition there unless `development` is set. An esbuild bundle of gyral-rs's
Askama client goes from 86,958 to 69,151 bytes. Development builds, Vite's output, and Node,
Deno and Bun (which always load the full build, as before) are unchanged. For development
checks in a non-Vite browser build, pass the `development` condition (esbuild:
`conditions: ['development']`).

`@gyral/ssr` finds core's hydration chunk in the production build too, so `clientAssets` and
`renderPage` keep preloading it.
