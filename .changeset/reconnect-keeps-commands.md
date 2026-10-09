---
'@gyral/core': patch
'@gyral/testing': patch
---

A component moved with `appendChild`/`insertBefore` (a disconnect and connect in the same
task, as keyed-list libraries do) keeps its commands running: a `subscription()` or periodic
timer started in `init` no longer stops for good after a reorder. A component that is removed
and attached again later receives the new optional framework message
`Connected { reconnect: true }`, so its reducer can re-issue long-lived commands; it is never
sent on the first connect or after a move. `step()` in `@gyral/testing` accepts `Connected`.

Behavior change: disconnecting stops a host's commands one microtask later instead of
synchronously. Tests that assert `signal.aborted` right after `el.remove()` need
`await Promise.resolve()` first.
