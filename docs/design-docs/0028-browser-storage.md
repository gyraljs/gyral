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

`makeIndexedDBDriver(stores, { database, version, upgrade?, name?, factory?, encode? })`
from `@gyral/core/indexeddb` takes a Standard Schema per store. Store names and record values
are typed together. The name defaults to `indexeddb`; the native factory is accessed lazily.
`encode(store, value)` optionally transforms a model record into its stored input shape.

Operations are `Read { store, key }`, `Put { store, value, key? }`,
`Delete { store, key }`, and `Query { store, index?, range?, direction?, limit }`.
Keys retain native `IDBValidKey` semantics. An omitted Put key uses the store's inline key or
auto-increment policy. Queries return primary keys and decoded records, iterate a cursor,
and require a positive integer limit (at most 2^32 - 1). Range data uses `Only { key }`,
`Lower { key, open? }`, `Upper { key, open? }` or
`Bound { lower, upper, lowerOpen?, upperOpen? }`; no browser key-range object in command data.
Index names are application-defined strings checked by IndexedDB.

`Transaction { operations }` runs a nonempty batch atomically across its named stores;
results stay in operation order. All native requests are queued synchronously. A batch with
Put/Delete is readwrite; otherwise readonly. Results are delivered only after the native
transaction completes, never after an individual write request succeeds. Read and Query
decode stored values after commit, allowing async schemas without keeping a transaction
alive. Decode failures carry `committed: true`: a committed batch cannot be rolled back by
a later decoder rejection. Write values are typed model records; encoding must produce
values consistent with the read schema. Absence is distinct from a stored undefined value.

The synchronous `upgrade(db, oldVersion, newVersion, transaction)` callback owns migrations,
object stores and indexes. It must queue any migration requests before returning; never
await inside it. A thrown migration aborts the upgrade and becomes a typed access failure.
Blocked upgrades reject promptly with `IndexedDBBlockedError`; since open requests cannot
be cancelled, any late upgrade is aborted and any late connection is closed. Retry is an
explicit application decision after the older tab/connection closes.

Abort attempts native transaction rollback and suppresses late output. It cannot undo an
already committed transaction. Connections close after each command's native transaction,
before async decoding, and on versionchange. Access/transaction failures, invalid operation
data, and decode failures use `IndexedDBError` through `toError`/`onFailure`. There is no
observation stream or localStorage emulation. Use `queue` for application-ordered writes.
Server-rendered model state still needs JSON-compatible values, even though IndexedDB can
store structured values such as dates and binary data. Tests substitute the driver by name.

The standalone production IndexedDB entry, measured with the same method as localStorage,
is 4,971 bytes / 1,900 bytes gzip. It adds no runtime code to examples that do not import it.

Sources: [storage events](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event),
[IndexedDB transaction completion](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event).
