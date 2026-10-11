# ADR 0028 — Optional native browser storage drivers

Status: **accepted** (2026-10-11). Owner-approved scopes: gyral-1zd.32 and gyral-1zd.33.
Builds on ADRs 0006 (commands), 0008 (decoding), 0012 (hydration), and 0025 (subscriptions).

## Placement and lifetime

`@gyral/core/storage` and `@gyral/core/indexeddb` are separate optional entry points, with
no dependencies and no browser access when imported or when their factories are called.
They use the existing `Driver`, `command`, `subscription`, `toError` and fake-driver
contracts. No new npm package or transport polyfill is required. Browser resources start
only when a command runs. Put initial reads/watches in `subscriptions` so server-seeded
state renders and hydrates before persisted browser data is applied.

## localStorage

`makeLocalStorageDriver(schema, { name?, prefix?, storage?, encode? })` returns a typed
driver. The schema decodes parsed JSON; `encode` optionally converts model values to the
JSON input shape when a schema transforms its input. Default encoding is JSON. `storage`
is a lazy storage factory for isolated tests or configured storage; by default it reads
native localStorage at command time. Names default to `localStorage`; prefixes default to
empty. A configured prefix owns only its namespace, including Clear.

Data inputs are `Read { key }`, `Write { key, value }`, `Remove { key }`, `Clear` and
`Watch { key }`. `StorageValue` distinguishes `found: false` from `found: true, value`;
write/remove/clear return completion tags. Watch starts with a `StorageChanged` snapshot,
then changes whose source is `driver` or `tab`. Invalid watch data emits
`StorageDecodeFailed` without ending the watch. Read decode errors and storage access
errors reject through typed `StorageError` and command `onFailure`.

Native storage events cover other tabs; a private hub covers successful writes/removals
through driver instances sharing the same Storage object. Arbitrary direct same-tab
mutations are not observed. Async decoders preserve event order; abort removes the native
listener/hub subscription and suppresses late values. There is no cross-tab atomicity or
transaction guarantee. Use distinct command keys for watches and writes.

The standalone production storage entry (all runtime exports retained, Vite minification,
gzip, 2026-10-11) is 3,674 bytes / 1,675 bytes gzip. Existing examples do not import it;
their size budgets stay unchanged. This is an entry cost, not an app-specific delta.

## IndexedDB

IndexedDB remains a distinct driver: structured records, object stores, bounded index
queries, versioned upgrades and transaction batches retain their native semantics. Its
detailed API is specified with its implementation; localStorage does not emulate it.

Sources: [storage events](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event),
[IndexedDB transaction completion](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event).
