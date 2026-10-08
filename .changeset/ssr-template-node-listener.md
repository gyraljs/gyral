---
'create-gyral': patch
---

The `ssr` template serves with `@gyral/ssr/node` (`createServer(toNodeListener(app.fetch))`) in
development and production, so generated apps no longer depend on `@hono/node-server`. Hono
stays as the template's request router.
