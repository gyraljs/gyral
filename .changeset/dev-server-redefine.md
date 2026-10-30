---
'@gyral/core': patch
'@gyral/ssr': patch
---

`gyralDevServer` and `gyralDevMiddleware` now server-render an edited component on the next
request (gyral-ejc). Before, an edit to a component module, or to a module it imports (a labels
file), showed only after a restart: Vite ran the module again, but the server kept the first
`define()` of each tag. The dev server now lets a later definition replace the spec, and the
server renderer rebuilds that component, with its styles and CSP hashes. Production servers,
tests and scripts keep the first definition, as before.
