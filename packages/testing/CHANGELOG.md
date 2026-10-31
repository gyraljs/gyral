# @gyral/testing

## 0.3.10

### Patch Changes

- Updated dependencies [5cb7e66]
- Updated dependencies [467f293]
- Updated dependencies [87a29dd]
- Updated dependencies [65a7dd5]
- Updated dependencies [9ab416d]
  - @gyral/core@0.3.10

## 0.3.9

### Patch Changes

- 26b3782: `parse()` from `@gyral/testing` now runs `on()` parsers without a DOM, so a Node test
  (Vitest's `node` environment) can test them (gyral-cd0). Before, `parse(C, 'Key', { key: 'Enter' })`
  on an `on('keydown', { keys: ['Enter'] }, …)` parser threw (G0018 for its `intent` event,
  `HTMLInputElement is not defined`, or a `TypeError` on the missing target) or quietly returned
  `undefined`. Now:

  - the event `parse()` creates has the type the `on()` parser declares and carries `key`;
  - the new `modifiers` field names the keys held: `parse(C, 'Save', { key: 's', modifiers: { ctrl: true } })`.
    It applies only to that event: with an `event` of your own, set `ctrlKey` and the rest on it
    (`parse()` throws when it gets both);
  - `on()`'s key filter reads the input's `key` before `event.key`;
  - with no target, `valueAsNumber` reads `value`, and `control`, `form` and `origin` are `undefined`.
    DOM classes are feature-detected, and an event without `composedPath()` is accepted.

  In the browser, `on()` behaves as before.

- Updated dependencies [7547000]
- Updated dependencies [4e9f962]
- Updated dependencies [9f424b5]
- Updated dependencies [2bdaed3]
- Updated dependencies [1c8ef8c]
- Updated dependencies [26b3782]
- Updated dependencies [74b5c5a]
- Updated dependencies [b2c15d1]
- Updated dependencies [014eec6]
  - @gyral/core@0.3.9

## 0.3.8

### Patch Changes

- 3e3200b: Gyral's packages take `@gyral/core` as a peer at their exact version (gyral-337.5, ADR 0033),
  so a package manager never installs a second core for them: the app's copy is used, and a
  mismatch shows at install time (pnpm reports the unmet peer, npm stops with ERESOLVE). Give
  every `@gyral/*` package the same version.

  Each package also checks core's version when it loads: another release throws G0016 in
  development, naming both versions, and logs the coded warning in production. A new guide,
  "Publishing a component library", says how third-party libraries list core: a caret peer, and
  public entry points only.

- 29bcfb1: Typed driver provision (gyral-337.2): a driver token provides its own implementation,
  `token.provide(run)` (named by the token, `run` typed by its input and output), and
  `subscription(token, subscribe)` is a subscription named and typed by its token. Drivers can be
  supplied as a list, each under its own name: `provideDrivers(root, [session.provide(run)])`,
  `el.drivers = [fake]`, `<gyral-drivers>`, `mount({ drivers })` and stores. Records keep working;
  development throws G0044 for two drivers of one name in a list and warns (G0045) when a
  record's key isn't its driver's name.
- Updated dependencies [3e3200b]
- Updated dependencies [fd34041]
- Updated dependencies [8d5ebb4]
- Updated dependencies [6fa91db]
- Updated dependencies [44eba98]
- Updated dependencies [c765366]
- Updated dependencies [29bcfb1]
  - @gyral/core@0.3.8

## 0.3.7

### Patch Changes

- Updated dependencies [295c705]
- Updated dependencies [2c1f071]
- Updated dependencies [16ef016]
- Updated dependencies [3d21a73]
- Updated dependencies [1454ffe]
  - @gyral/core@0.3.7

## 0.3.6

### Patch Changes

- 893c4e7: Docs and agent guidance aligned with the code:

  - `listen`'s doc comment (and so `get_api("listen")` and the API reference) starts it from `subscriptions`, not `init`, matching the guides and `check_snippet`.
  - `scaffold_component`'s `ssr-page` route imports the component from `../src/`, where it is written; a test now resolves every relative import in every scaffold.
  - Development error messages no longer cite internal design documents; the hydration-mismatch message links to gyral.dev. The error groups on the errors page are named "Error handling", "Subscriptions" and "Element calls".
  - `retry`'s doc comment names `provideDrivers` and `el.drivers` (the spec `drivers` field was removed in 0.3.1); `@gyral/testing`'s description drops the removed schema arbitraries; the `clientOnly` comment drops a removed API.
  - create-gyral's `AGENTS.md` adds the MCP server, `llms-small.txt`, the `subscriptions` rule and the real `typecheck` script.

- Updated dependencies [893c4e7]
- Updated dependencies [820577b]
  - @gyral/core@0.3.6

## 0.3.5

### Patch Changes

- Updated dependencies [be8f8d1]
  - @gyral/core@0.3.5

## 0.3.4

### Patch Changes

- Updated dependencies [340eae6]
  - @gyral/core@0.3.4

## 0.3.3

### Patch Changes

- Update the `@gyral/core` dependency to 0.3.3.

## 0.3.2

### Patch Changes

- Add `viewOf(Component, state, { props, stores })`, which calls a component's pure view without
  mounting it or a DOM shim. Pass the result to `renderToString(..., { dev: false })` for
  stable HTML assertions in Node. Hooks, native validity, focus and hydration still need
  browser tests.
- Update the `@gyral/core` dependency to 0.3.2.

## 0.3.1

### Patch Changes

- Add typed mounting, SSR mounting/hydration helpers, Vitest server rendering commands and
  diagnostics collection for real-browser component and hydration tests.
- Model tests inspect outputs, focus/call commands and declarative subscriptions. Parsers
  can be tested with supplied stores, and fake drivers support both recorded commands and
  streaming emissions by driver name.
- Virtual time works in Node and browsers and controls declarative timer/retry behavior.
  Scheduler waiters and recording fakes release completed work correctly.
- Use core `provideDrivers`, `parse(..., { stores })`, store instances and `inputsFor` in place
  of redundant helper exports. The arbitraries entry is removed; applications define their
  own fast-check message arbitraries.
- Update the `@gyral/core` dependency to 0.3.1; see the [migration guide](https://github.com/gyraljs/gyral/blob/main/docs/references/migrating-0.3.0-to-0.3.1.md).

## 0.3.0

### Minor Changes

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
- cfb24ce: `step()` and `run()` accept the `Hydrated` framework message, so `Hydrated` reducers can be
  unit-tested; without a reducer it leaves state unchanged, as in the element.
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
