# @gyral/ssr

## 0.3.4

### Patch Changes

- 449be68: `renderPage({ components })` no longer links a module twice. The components loader can import
  the client entry, so a component bundled into the entry preloaded the entry's whole graph after
  the body, repeating every `<link rel="modulepreload">` the head already wrote from
  `modulepreload`. The tail after the body now leaves out each module, stylesheet and script the
  page's head links (`modulepreload`, `stylesheets`, `scripts`), never links one of its own URLs
  twice, and keeps the order otherwise. This holds for `renderPage` (streamed or rendered to a
  string first), `renderToString` of a `page()`, and so for `prerender`, `productionServer` and
  `gyralDevServer` apps. Apps that filtered `components` against `modulepreload` to avoid the
  duplicates can pass both lists unchanged.
- Updated dependencies [340eae6]
  - @gyral/core@0.3.4

## 0.3.3

### Patch Changes

- Update the `@gyral/core` dependency to 0.3.3.

## 0.3.2

### Patch Changes

- Add `writeComponentStyleManifest({ root, clientDir, outFile, vite? })` to `@gyral/ssr/static`.
  It runs after the client build, imports the app's component modules in a separate build-time
  Node process, and writes their real `<style>` hashes to a JSON file.
- Add `componentStyleHashes` to `CspOptions`. A server that only builds the
  `Content-Security-Policy` header can pass the hashes from that JSON file instead of importing
  every component module, and keep a strict CSP.
- Update the `@gyral/core` dependency to 0.3.2.

## 0.3.1

### Patch Changes

- `renderPage` produces pull-based chunks from synchronous rendering. Load data before
  rendering; status and headers are final before the first byte. Component failures can
  render a fallback without a seed, or fail the response under `onError: 'throw'`.
- Automatic components load only the modules a page renders, including folded/entry-owned
  modules. Client assets include hashed stylesheets and preloads; shared head data supports
  canonical URLs, JSON-LD, media-qualified metadata and pre-stylesheet head scripts.
- CSP supports hashed server style attributes and invalidates cached policies when component
  registration changes. Forms redact secrets and support validation/refilling and JSON-only
  rejection responses.
- `@gyral/ssr/node` supplies `toNodeListener` with request context and `gyralDevServer`.
  Node request bodies, response cancellation and keep-alive paths are handled correctly.
- Production serving handles HEAD, malformed asset escapes, content types, cache headers,
  immutable hashed assets, response hooks and server-rendered fallback routes.
- Use `renderPage`, `clientAssetsFromManifest` and the production/static helpers; redundant
  low-level public APIs are removed. Update core to 0.3.1 and read the
  [migration guide](https://github.com/gyraljs/gyral/blob/main/docs/references/migrating-0.3.0-to-0.3.1.md).

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
