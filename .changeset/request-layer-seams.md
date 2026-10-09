---
'@gyral/ssr': patch
---

Seams for fetch routers (ADR 0026: the request layer stays with routers such as Hono):
`formAction`'s `invalid` handler is optional, and without it every rejection is the JSON 422
(endpoints only `submitForm` calls); `wantsJson(request)` is exported; and
`productionServer({ onResponse })` sees every response (assets, prerendered pages, the app's) to
add headers or cookies.
