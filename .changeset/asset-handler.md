---
'@gyral/ssr': patch
---

`productionServer` serves assets safely: a malformed escape such as `/assets/%E0%A4%A` is a 400
instead of an exception out of `fetch`, `HEAD` works for assets and prerendered pages (headers,
no body), images, fonts, `.json`, `.mjs`, `.wasm` and `.ico` get their content types, every file
response carries `content-length` and `x-content-type-options: nosniff`, and a missing asset is a
404 with `cache-control: no-store`, so a CDN never caches a miss before a deploy lands. Served
assets stay in memory (bounded at 64 MiB by default; option `cache`). New options: `assetsDir`
(for example a volume that keeps older releases' files) and `staticDir` (`false` when nothing is
prerendered, so page requests no longer look for a file first). The asset half is exported
alone as `assetHandler({ dir, prefix, cache })` from `@gyral/ssr/static`.
