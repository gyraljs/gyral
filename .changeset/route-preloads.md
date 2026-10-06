---
'@gyral/ssr': minor
---

Route chunks can be preloaded too. `clientAssets(manifest, entry, also)` and
`clientAssetsFromManifest(path, entry, also)` take manifest keys of modules a page imports lazily
(a route's `src/routes/product.ts`) and add them, with their static imports, to `modulepreload`;
`productionServer` gives `createApp` a `preload(modules)` that returns the page's list with them
(cached per list).
