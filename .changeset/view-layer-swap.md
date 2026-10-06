---
'@gyral/core': minor
'@gyral/ssr': minor
'@gyral/testing': minor
'@gyral/devtools': minor
'create-gyral': minor
---

Gyral's own view layer replaces Lit (ADR 0018). `define()` returns a plain `HTMLElement`
subclass rendered by one global scheduler; `await settled()` replaces `el.updateComplete`.
Props are declared with `prop.string/number/boolean/json/value` over Standard Schema
(kebab-case attributes, validated). `@gyral/core` exports `html`, `css`, `nothing`, `each`,
`raw`, `defineHook`, `prop` and the hooks `invalid` and `labelledBy`; `svg`, `classMap`,
`styleMap`, `unsafeCSS`, `repeat`, `keyed`, `live`, `liveBoolean`, `textarea()` and
`directive`/`ElementDirective` are gone, and `lit` is no longer a peer dependency. Server
rendering is Gyral's own (`@gyral/core/server`), and hydration is built into core: each
server-rendered component adopts its DOM in place, on its own (no `@gyral/ssr/hydrate`
needed); mismatches throw `HydrationMismatch` in development and re-render just that
component in production. Islands may sit anywhere.
