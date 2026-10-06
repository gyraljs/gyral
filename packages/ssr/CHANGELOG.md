# @gyral/ssr

## 0.3.0

### Minor Changes

- 595e1c4: `renderPage({ csp })` also takes `contentSecurityPolicy()`'s options (`{ directives, styles? }`)
  and builds the `Content-Security-Policy` header when the page renders, so components whose
  modules were imported after startup get their `<style>` hashes too (a policy built earlier
  silently lacked them, and the browser blocked those styles). `styles` defaults to the page's
  own; the header is cached per options object until another component registers.
  `contentSecurityPolicy()` stays for static use; in development `renderPage` warns when a header
  it is given lacks a registered component's hash. `@gyral/core/server` adds `styleHashSync()`
  (the CSP hash, synchronously: a small SHA-256 in JavaScript), `componentStyles()` and
  `development`. The `create-gyral` ssr template uses `csp: {}`.
- 7d5b529: Server-rendered pages preload what hydration needs. `clientAssetsFromManifest(manifest, entry)`
  (`@gyral/ssr/static`) reads Vite's build manifest and returns the entry URL plus `modulepreload`:
  the entry's static imports and `@gyral/core`'s lazily loaded hydration chunk (the app's own lazy
  chunks stay lazy). `page()`/`renderPage({ modulepreload })` writes a `<link rel="modulepreload">`
  for each before the module scripts, and `productionServer` passes `modulepreload` to
  `createApp` next to `clientEntry`. The `ssr` template of `create-gyral` uses it.
- 1432983: Route chunks can be preloaded too. `clientAssets(manifest, entry, also)` and
  `clientAssetsFromManifest(path, entry, also)` take manifest keys of modules a page imports lazily
  (a route's `src/routes/product.ts`) and add them, with their static imports, to `modulepreload`;
  `productionServer` gives `createApp` a `preload(modules)` that returns the page's list with them
  (cached per list).
- d3f540a: Gyral's own view layer replaces Lit (ADR 0018). No Gyral package depends on Lit any more, and
  `@gyral/core` has no runtime dependencies. Upgrade guide with before/after code:
  [docs/references/migrating-0.2-to-0.3.md](https://github.com/gyraljs/gyral/blob/main/docs/references/migrating-0.2-to-0.3.md).

  - **`@gyral/core`:** `define()` returns a plain `HTMLElement` subclass rendered by one global
    scheduler; `await settled()` replaces `el.updateComplete`. `html`, `css` and `nothing` are
    Gyral's own; new are `each(items, key, row, pick?)` (keyed lists with pure rows),
    `intents<Msg>()`, `raw()`, `defineHook()` (the hooks `invalid` and `labelledBy` keep their call
    sites) and `HydrationMismatch`. Props are declared with `prop.string/number/boolean/json/value`
    over Standard Schema: attributes are kebab-case by default and always validated. Form state
    uses plain bindings (`value=${v}`, `?checked=${v}`, `<textarea>${v}</textarea>`), written
    only when the model's value changes, so other renders keep the user's edits. Removed:
    `svg`, `classMap`, `styleMap`, `unsafeCSS` (interpolate in `css`), `repeat`, `keyed`, `live`,
    `liveBoolean`, `textarea()`, `textareaMarkup`, `directive`/`ElementDirective`,
    `defineStoresProvider`, `HIDDEN_MARKER`, `HYDRATE_KEY`, `CSSStyleSheet` in `styles`, and
    `LIT_PACKAGES`/`LIT_PREBUNDLE` from `@gyral/core/vite`. `gyralVitePreset()` now runs the
    template compiler in `vite build` (rule errors fail the build). Server rendering is
    `@gyral/core/server`; hydration is built in: each server-rendered component adopts its DOM in
    place on its own, mismatches throw `HydrationMismatch` in development and re-render just that
    component in production, and islands may sit anywhere.
  - **`@gyral/ssr`:** renders with `@gyral/core/server` (synchronous, no DOM shim). `serverHtml` is
    gone (use core's `html`); `contentSecurityPolicy()` allows components' `<style>` by hash, so
    `style-src` needs no `'unsafe-inline'`. A template that writes children inside a light
    component's tag is an error. `@gyral/ssr/hydrate` is kept as an empty entry; remove the import.
  - **`@gyral/testing`:** `hydrated()` waits for `settled()` and takes `{ releaseIslands }`; it no
    longer awaits other elements' `updateComplete`, and `mountSsr` no longer ignores Lit's console
    banner.
  - **`@gyral/devtools`:** the panel renders with the new view layer; no Lit peer.
  - **`create-gyral`:** the templates install no Lit packages and no `lit-html` override.

### Patch Changes

- 2cc2704: `clientAssets()` and `clientAssetsFromManifest()` list the entry chunk first in `modulepreload`
  whenever anything else is preloaded, so route chunks added with `also` (or `productionServer`'s
  `preload()`) can no longer delay the entry on HTTP/1.1. Pages that preload nothing are unchanged.
- Updated dependencies [fe849f8]
- Updated dependencies [595e1c4]
- Updated dependencies [49ff2ad]
- Updated dependencies [9c6c8bd]
- Updated dependencies [ca68fe8]
- Updated dependencies [784bd2f]
- Updated dependencies [8803ef3]
- Updated dependencies [6971fbe]
- Updated dependencies [b2ae8e5]
- Updated dependencies [d3f540a]
  - @gyral/core@0.3.0

## 0.2.0

### Minor Changes

- 74054b3: Smaller and faster, with no public API change:

  - **No Effect.** The command interpreter is now plain TypeScript with no runtime dependencies,
    so `@gyral/core` depends only on Lit. An empty app drops from about 49 KiB to about 11 KiB
    gzipped, starts faster and uses less memory; rendering speed is unchanged (ADR 0015).
  - **Template whitespace minification.** `html` and `svg` remove indentation whitespace between
    tags (once per template, on server and client alike), so lists build far fewer DOM nodes and
    bulk list updates are 9–22% faster. Inline spacing is kept as one space; `<pre>`,
    `<textarea>`, `<script>`, `<style>`, attributes and comments are unchanged. For exact
    whitespace under CSS `white-space: pre*`, use `html` from `lit`.
  - **lit-html leak guidance.** lit-html 3.3.1 and later leak a comment node per removed
    `repeat()` item (lit/lit#5298). Development builds warn once when an affected version is
    loaded; pin lit-html to 3.3.0 with an override until it is fixed upstream
    (docs/references/consumer-setup.md). New `create-gyral` apps are pinned.

### Patch Changes

- a7275e8: Copyright and package author are Mike Zupper.
- Updated dependencies [a7275e8]
- Updated dependencies [fa0156a]
- Updated dependencies [74054b3]
  - @gyral/core@0.2.0

## 0.1.0

### Minor Changes

- 8b5f5ca: First public release.

### Patch Changes

- Updated dependencies [8b5f5ca]
  - @gyral/core@0.1.0
