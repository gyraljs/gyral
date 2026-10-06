---
'@gyral/core': minor
'@gyral/ssr': minor
'@gyral/testing': minor
'@gyral/devtools': minor
'create-gyral': minor
---

Gyral's own view layer replaces Lit (ADR 0018). No Gyral package depends on Lit any more, and
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
