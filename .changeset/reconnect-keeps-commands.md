---
'@gyral/core': patch
---

A component moved with `appendChild`/`insertBefore` (a disconnect and connect in the same
task, as keyed-list libraries do) keeps its commands running: a long-lived command no longer
stops for good after a reorder.

Behavior change: disconnecting stops a host's commands one microtask later instead of
synchronously. Tests that assert `signal.aborted` right after `el.remove()` need
`await Promise.resolve()` first.
