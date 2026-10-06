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
rendering is being rebuilt on the view layer: until then `@gyral/ssr`'s rendering throws and a
server-rendered component resumes from its seed and renders fresh.
