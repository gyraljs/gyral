---
'@gyral/core': patch
---

Element hooks can tear down: `defineHook({ client, dispose, server? })`'s optional
`dispose(el, args)` runs when Gyral removes the hook's element (its part cleared, its template
replaced, its `each` row or array item removed), when the position stops holding the hook, and
when the host disconnects, never on moves (`moveBefore()`, list reorders). After a host
reconnects, `client` runs again with `prev` undefined. The tracking (about 0.25 KiB gzip) is
bundled only when some module names `dispose`, so apps whose hooks need no teardown don't pay
for it. The docs and the skill lead with the native pattern for widgets with a lifecycle (their
own custom element, teardown in `disconnectedCallback`) and present a hook with `dispose` as the
lighter option for small imperative behaviours.
