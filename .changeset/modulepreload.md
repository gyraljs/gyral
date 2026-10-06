---
'@gyral/ssr': minor
'create-gyral': minor
---

Server-rendered pages preload what hydration needs. `clientAssetsFromManifest(manifest, entry)`
(`@gyral/ssr/static`) reads Vite's build manifest and returns the entry URL plus `modulepreload`:
the entry's static imports and `@gyral/core`'s lazily loaded hydration chunk (the app's own lazy
chunks stay lazy). `page()`/`renderPage({ modulepreload })` writes a `<link rel="modulepreload">`
for each before the module scripts, and `productionServer` passes `modulepreload` to
`createApp` next to `clientEntry`. The `ssr` template of `create-gyral` uses it.
