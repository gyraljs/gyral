---
'@gyral/core': patch
---

Add the optional @gyral/core/storage entry with typed localStorage commands and cancellable
change subscriptions. Decode persisted JSON with Standard Schema, distinguish absent/invalid
data, observe other tabs and driver-issued writes, and restrict prefixed Clear operations to
their namespace. Imports and factories are safe on the server.
