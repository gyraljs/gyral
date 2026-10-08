---
'@gyral/ssr': patch
---

Hashed stylesheets: `clientAssets()` and `clientAssetsFromManifest()` return `css`, the
content-hashed CSS files Vite emitted for the client entry, its static imports and any `also`
modules (each after its imports', each once), and `page()`/`renderPage()` take
`stylesheets` and write `<link rel="stylesheet">` for them before the inline `styles`.
`productionServer` hands `createApp` `stylesheets`, plus `assets(modules)`, which returns
`{ modulepreload, stylesheets }` for a page that imports route modules lazily (spread it into
`renderPage`); `preload(modules)` is unchanged. Import your global CSS from the client entry so
Vite hashes it; `style-src 'self'` allows the linked files without hashes.

Behavior change (types): `ClientAssets` has a required `css` field; code that builds one by hand adds `css: []`.
