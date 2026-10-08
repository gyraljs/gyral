---
'@gyral/ssr': patch
---

New `@gyral/ssr/node` subpath: `toNodeListener(fetch, { origin?, onError? })` mounts any fetch
handler (`productionServer(…).fetch`, a Hono app, a function) on `node:http`, so Node apps need
no adapter of their own. Request bodies stream into the `Request`, whose `signal` aborts when the
client disconnects; response bodies are written with backpressure (a `renderPage` body renders
only as fast as the client reads, and is cancelled when it leaves); `HEAD` sends headers only;
each `set-cookie` stays a separate header; a throwing handler is a 500 and a body that fails
after the headers cuts the connection.
