---
'@gyral/ssr': patch
---

`clientAssets()` and `clientAssetsFromManifest()` list the entry chunk first in `modulepreload`
whenever anything else is preloaded, so route chunks added with `also` (or `productionServer`'s
`preload()`) can no longer delay the entry on HTTP/1.1. Pages that preload nothing are unchanged.
