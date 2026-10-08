---
'@gyral/ssr': patch
---

Docs: `renderPage` and `renderToStream` are described as what they are, chunked, pull-based output
of a synchronous render (one component boundary per pull, status and headers final before the
first byte), not async or suspense streaming: load data before rendering. The JSDoc, README, ADR
0012, view/06 and the skill's SSR reference say so.
