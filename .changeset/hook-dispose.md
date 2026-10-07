---
'@gyral/core': patch
---

Element hooks can tear down: `defineDisposableHook({ client, dispose, server? })` defines a hook
whose `dispose(el, args)` runs when Gyral removes the hook's element (its part cleared, its
template replaced, its `each` row or array item removed), when the position stops holding the
hook, and when the host disconnects, never on moves (`moveBefore()`, list reorders). After a host
reconnects, `client` runs again with `prev` undefined. It is a function of its own, not an option
of `defineHook` (which rejects a `dispose`: a type error, and a development error), so only apps
that call it bundle the tracking (about 0.25 KiB gzip); apps whose hooks need no teardown pay
nothing. The docs and the skill lead with the native pattern for widgets with a lifecycle (their
own custom element, teardown in `disconnectedCallback`) and present `defineDisposableHook` as the
lighter option for small imperative behaviours.
