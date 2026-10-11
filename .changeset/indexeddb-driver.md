---
'@gyral/core': patch
---

Add the optional @gyral/core/indexeddb entry with typed record operations, bounded index
queries and transaction batches that report success after commit. Support application-owned
versioned migrations, blocked-upgrade errors, async record decoding, cancellation and
connection cleanup. Imports and factories are safe on the server.
