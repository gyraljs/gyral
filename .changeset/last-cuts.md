---
'@gyral/testing': patch
'@gyral/core': patch
---

Behavior change: `@gyral/testing` no longer exports `readerOf`, `withDrivers`, `testStore` or
`sentTo`. Use `parse(Component, 'Intent', input, { stores })` to call a parser with store reads,
`provideDrivers(root, drivers)` from `@gyral/core` to provide fakes to a subtree,
`store.instance(initial)` for a fresh store, and `inputsFor(commands, store)` for the messages
a reducer sends to a store (`inputsFor` now also accepts a store).

Behavior change: `@gyral/core/vite` exports only `gyralVitePreset` and its option types. The
template compiler and the client-only build are preset options (`compiler`, `clientOnly`).
