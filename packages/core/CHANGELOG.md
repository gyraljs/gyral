# @gyral/core

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
- ca68fe8: `@gyral/core/eslint`: an ESLint flat-config plugin (`gyral.configs.recommended`). `gyral/template`
  reports the template rules (docs/design-docs/view/09-template-rules.md) in the editor, with the
  compiler's and the development runtime's own messages, at the tag, text or `${…}` they are
  about; `gyral/each-row-purity` reports `each` rows that read the view's scope and `each` calls
  without a key function (view/03-lists.md). ESLint 9 or 10 is an optional peer dependency.
- 784bd2f: `renderOnFrame` (spec field): messages from bursty sources (a WebSocket feed, sensors) render in
  the next animation frame, once for all of them, instead of in the microtask flush; reducers still
  run at once, and `'StoreChanged'` covers store changes. Pages without frames render from a 100 ms
  timer, so `settled()` never stalls. The microtask flush stays the default (flush-timing spike,
  docs/design-docs/view/04-scheduler.md).
- 6971fbe: Smaller bundles (size pass, ADR 0018): code an app doesn't use is no longer bundled. The keyed
  list reconciler comes with `each`, `raw` with `raw`, the command interpreter with `command()`,
  the store binding with `defineStore()` and prop parsing with the prop builders. Hydration and
  islands load lazily, with the first server-rendered host, so client-only pages never fetch them;
  the invoker-command fallback loads only where `CommandEvent` is missing. A component root now
  listens only for the events its templates can fire intents on (any statically named
  `data-intent-on` type works without `spec.events`). New: `intents<Msg>()`, a module-level
  constant of intent names for pure `each` rows.
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

- fe849f8: Compiled templates are smaller: part tables are tuples with numeric kinds and `server` is written
  only when true (about a quarter less template code raw; every example's bundle shrinks by
  35-97 B gzip). Nothing decodes them at runtime; template ids are unchanged.
- 49ff2ad: The Vite preset's new `gyral:dev-server` plugin makes server rendering under Vite's dev server
  (`ssrLoadModule`) produce development output (`<!--gyral:ID-->` markers, development checks)
  with installed packages too: in serve mode it keeps `@gyral/*`, and the app's dependencies that
  depend on them, out of SSR externalization, so they resolve the `development` condition and
  share one `@gyral/core`. `vite build` is unchanged.
- 9c6c8bd: The server renderer escapes `<` and `>` in attribute values and in the seed attribute too, so
  no markup (such as `<script>`) appears raw inside an attribute. Browsers decode them, so values
  and hydration are unchanged.
- 8803ef3: Leaner page shells. A `server` template (a document shell such as `@gyral/ssr`'s `page()`) is
  never hydrated, so the server no longer writes anchor comments (`<!---->`) for it or for `raw()`
  values in its holes; templates nested in a shell keep theirs. The whitespace rules treat
  `<head>`, `<meta>`, `<link>`, `<base>` and `<title>` as block-level edges and drop all
  whitespace-only text inside `<head>`. Ids of templates with those tags change (the same in the
  compiler, the browser and the server).
- b2ae8e5: Production client builds no longer carry template ids: the template compiler leaves them out
  of the hoisted template objects, and the renderer compares templates by object identity there
  (about a fifth less compiled template code gzip: 10.32 → 8.27 KiB on a 210-template corpus).
  SSR and development builds keep their ids (development markers, collision checks). One visible
  difference: identical markup at call sites in two modules is now two templates in production,
  so switching between them replaces the instance instead of patching it.

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
- fa0156a: `focus()` returned by a reducer whose update renders inside a View Transition now runs after
  the new view has rendered, instead of before it (it used to warn "matched no focusable element").

## 0.1.0

### Minor Changes

- 8b5f5ca: First public release.
