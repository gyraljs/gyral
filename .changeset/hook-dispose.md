---
'@gyral/core': patch
---

Element hooks take an optional `dispose(el, args)`: it runs when Gyral removes the hook's element
(its part cleared, its template replaced, its `each` row or array item removed), when the
position stops holding the hook, and when the host disconnects, never on moves (`moveBefore()`,
list reorders). After a host reconnects, `client` runs again with `prev` undefined. The docs and
the skill lead with the native pattern for widgets with a lifecycle (their own custom element,
teardown in `disconnectedCallback`) and present `dispose` as the lighter option for small
imperative behaviours. Apps that call `defineHook` bundle the tracking (about 0.25 KiB gzip);
apps that only use `invalid`/`labelledBy` don't.
