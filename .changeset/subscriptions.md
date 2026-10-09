---
'@gyral/core': patch
'@gyral/testing': patch
---

New spec field `subscriptions(state, props)`: the long-lived commands (clocks, polling,
sockets, store or media-query watches, the router's `listen`) that should be running now.
Gyral starts them after the first render and diffs the list by lane after every update and
props change: new lanes start, missing lanes are aborted, a lane whose input changed restarts,
and an unchanged lane keeps running. Moves keep them running; a real removal stops them; a
component attached again starts them from its current state. `subscriptionsFor(spec, state,
props)` in `@gyral/testing` returns the list for model tests. The diff is included only in
builds that use the field.

Behavior change: the `Connected` framework message is removed. Move the watches its reducer
re-issued into `subscriptions`.
