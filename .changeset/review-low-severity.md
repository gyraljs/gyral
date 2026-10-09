---
'@gyral/core': patch
'@gyral/ssr': patch
---

Smaller fixes from the 0.3.1 review:

- `capturePointer()` is a disposable hook: a position that stops holding it removes its
  `pointerdown` listener, and adding it again never adds a second one.
- `prop.json`'s default `equals` no longer throws from the property setter for a value JSON
  can't encode (a cycle, a BigInt): such a write always counts as a change, with a one-time
  development warning to use `prop.value` or pass `equals`.
- The `ShadowOption` type (`shadow: boolean | { delegatesFocus }`) is exported from
  `@gyral/core`.
- `clientAssets`, `clientAssetsFromManifest` and `clientEntryFromManifest` take `{ base }`, and
  `productionServer({ base })` uses it: URLs start with Vite's `base` and assets are served at
  `<base>assets/`. Before, an app built with `base: '/app/'` linked stylesheets and preloads
  that 404'd.
- `assetHandler` answers a single-range `Range` request with a 206 and that slice (and a 416
  when unsatisfiable), so imported video and audio can seek; every asset carries
  `accept-ranges: bytes`.
