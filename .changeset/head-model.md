---
'@gyral/core': patch
'@gyral/router': patch
'@gyral/ssr': patch
'@gyral/testing': patch
---

A head model shared by the server's page shell and the router (ADR 0019). `Head` (title, description, canonical, robots, `meta`, `links`, JSON-LD, `lang`, `dir`) is one value: `page()` / `renderPage()` take its fields and write each managed element right after `<title>`, marked `data-gyral-head`, and the router's new `setHead(head)` makes the document's head match it after a client navigation. Keyed and minimal: unchanged elements aren't written (the first navigation after hydration writes nothing), managed elements the new head doesn't name are removed, and other head content is never touched. Build the head with one pure function and pass it to both. JSON-LD needs no CSP allowance; under enforced Trusted Types the client skips JSON-LD updates. The memory history records the head in `snapshot().head`. `mountSsr` copies the managed head so app tests can check that hydration adopts it. Apps that never call `setHead` don't bundle the applier.

Behavior change: `setTitle(title)` is removed; use `setHead({ title })` or `setHead(pageHead(…))`. The router input `{ _tag: 'Title', title }` is now `{ _tag: 'Head', head }`, and `RouterSnapshot.title` is now `head` (`snapshot().head?.title`). `page({ head })` is renamed `page({ extraHead })`; move the tags the model covers (description, canonical, robots, Open Graph meta, alternates, JSON-LD) into `Head` fields. `page()` now marks its description meta with `data-gyral-head`.
