---
'@gyral/ssr': minor
'@gyral/core': minor
'create-gyral': minor
---

`renderPage({ csp })` also takes `contentSecurityPolicy()`'s options (`{ directives, styles? }`)
and builds the `Content-Security-Policy` header when the page renders, so components whose
modules were imported after startup get their `<style>` hashes too (a policy built earlier
silently lacked them, and the browser blocked those styles). `styles` defaults to the page's
own; the header is cached per options object until another component registers.
`contentSecurityPolicy()` stays for static use; in development `renderPage` warns when a header
it is given lacks a registered component's hash. `@gyral/core/server` adds `styleHashSync()`
(the CSP hash, synchronously: a small SHA-256 in JavaScript), `componentStyles()` and
`development`. The `create-gyral` ssr template uses `csp: {}`.
