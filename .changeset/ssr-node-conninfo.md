---
'@gyral/ssr': patch
---

`toNodeListener` passes `{ incoming, remoteAddress }` as the fetch handler's second argument: the Node request and the client's IP address, for rate limits, logs and audits. It is the shape Hono's Node adapter uses, so `getConnInfo` from `@hono/node-server/conninfo` works on a Hono app mounted with `toNodeListener`. Handlers that take only the request are unchanged.
