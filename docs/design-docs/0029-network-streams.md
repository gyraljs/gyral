# ADR 0029 — Optional native network stream drivers

Status: **accepted** (2026-10-11). Owner-approved scopes: gyral-1zd.34 and gyral-1zd.35.
Builds on ADRs 0006 (drivers), 0022 (retry wrappers) and 0025 (subscriptions).

## Placement

`@gyral/http/sse` and `@gyral/http/websocket` are optional package entries. They add no
runtime dependency, transport polyfill or new npm package. Neither is re-exported by the
fetch entry. Imports and factory creation are safe without browser globals; only running
commands opens connections. Standard Schema decodes at the boundary. Usual `command`,
`subscriptions`, name-based substitution and fake-driver conventions apply.

## EventSource

`makeEventSourceDriver(schema, { name?, withCredentials?, events?, parse? })` returns a
streaming Driver over `{ url }`. The name defaults to `sse`; parse defaults to JSON parsing.
The source observes `message` plus explicitly configured event names (deduplicated).
Named `open`/`error` MessageEvents are decoded without treating them as connection events.

Outputs are `EventSourceState { url, state: connecting | open | closed }`,
`EventSourceMessage { url, eventType, lastEventId, data }`, and
`EventSourceDecodeFailed { url, eventType, lastEventId, issues }`. Async decoders preserve
message arrival order. Malformed data reports a decode output and leaves the connection
alive. Cancellation/terminal cleanup suppresses pending decoded results.

Native EventSource owns GET, cookie credentials, reconnection, server retry timing and
Last-Event-ID. `withCredentials` configures cross-origin credentials (default false).
An error while CONNECTING emits connecting state and retains the same source. A CLOSED
error emits closed state and rejects with typed `EventSourceError` through `onFailure`;
the browser exposes no detailed HTTP failure. The driver adds no second retry loop.
Abort/terminal failure removes all listeners and closes the source. A switched subscription
therefore releases the old connection before opening the new one.

There are no arbitrary request headers, POST streams, fetch-based transport, wildcard
event listener, exactly-once delivery or promised server replay. Event IDs are metadata;
the application/server owns deduplication and replay semantics. Start feeds in subscriptions
so server-seeded state hydrates before network events update it.

Standalone production SSE entry (all runtime exports retained, Vite minification, gzip,
2026-10-11): 2,969 bytes / 1,368 bytes gzip. Existing fetch apps contain neither EventSource
nor WebSocket code, and their size budgets are unchanged. This is an entry cost, not an
app-specific delta.

## WebSocket

`makeWebSocketDriver(schema, { encode, parse?, name?, maxBufferedBytes? })` owns a map of
connections by explicit string ID. Its name defaults to `websocket`. Inputs are
`Connect { connection, url, protocols? }`, `Send { connection, value }`, and
`Close { connection, code?, reason? }`. Connect is the streaming command; Send and Close use
that same owned socket. Duplicate active IDs reject instead of silently sharing. Keep IDs
unique within a driver shared through a provider, and use distinct connect/send/close lanes.
Cancel/switch deletes only the cancelled command's owned map entry, then closes its socket.

Incoming payloads are strings or ArrayBuffers (`binaryType = arraybuffer`). Default parse is
JSON text; a custom synchronous `parse(payload)` handles other text/binary protocols. The
Standard Schema may validate asynchronously; results stay in message arrival order. Bad
payloads emit `WebSocketDecodeFailed` without ending the socket. The required outgoing
`encode(value)` returns native string, Blob, ArrayBuffer or ArrayBufferView data.

Outputs are `WebSocketState { connection, url, state: connecting | open | closing }`,
`WebSocketMessage { connection, data }`, `WebSocketDecodeFailed { connection, issues }`,
`WebSocketSent { connection, bytes }`, `WebSocketCloseRequested { connection }`, and
`WebSocketClosed { connection, url, code, reason, wasClean, requested }`.
The requested flag distinguishes a valid application Close from a server/transport close.
Keep an abnormal attempt's Closed message subscribed while the retry wrapper decides;
dropping the subscription aborts its retries. Drop it on requested/normal completion or
final onFailure instead.

The default outgoing buffer limit is 65,536 bytes. A configured limit must be a nonnegative
safe integer (invalid configuration throws before resources open). Send rejects when there
is no owned OPEN socket or when native bufferedAmount plus the encoded payload's byte count
would exceed the limit. UTF-8 counts string bytes; Blob/ArrayBuffer/views use their actual
byte sizes. Send success means browser enqueue, not server receipt or acknowledgement.
Encoding/native send errors are typed; no failed Send closes the connection or queues data.

A clean normal code 1000 close resolves Connect with WebSocketClosed. An explicit Close
request (default code 1000) also resolves its eventual close, including application codes,
so retry cannot reopen an intentionally closed connection. Other closes emit WebSocketClosed
then reject with `WebSocketClosedError` carrying code/reason/wasClean and whether a native
error occurred. Native errors are recorded until the ensuing close event preserves its
metadata; they expose no HTTP diagnosis. Constructor/duplicate-ID failures are
WebSocketConnectError; sends use WebSocketSendError; invalid close requests use
WebSocketCloseError. All failures flow through toError/onFailure.

Connect uses a finite promise rather than subscription's never-resolving helper, so normal
closure has a completion result. It follows the same abort/cleanup/emit contracts. Cleanup
removes all native/abort listeners, releases ownership, closes active sockets and suppresses
pending decoded results. An ended declarative subscription stays ended; drop/re-add its
lane/input when the application explicitly wants another connection.

No automatic reconnect, offline queue, replay or protocol acknowledgement is provided.
Wrap the driver in existing `retry()` explicitly with backoff/jitter and retryIf accepting
only retryable Connect/Closed errors; exclude Send errors to avoid retrying sends. Abort
never retries. Applications own resynchronization and acknowledgement messages. Native
WebSocket has no inbound backpressure; this outgoing limit does not bound inbound load.
`ws` and its types are root development dependencies solely for the real-browser test
server, never runtime/package dependencies or a browser transport.

Standalone production WebSocket entry (all runtime exports retained, Vite minification,
gzip, 2026-10-11): 4,206 bytes / 1,596 bytes gzip. Existing app size budgets are unchanged.

Sources: [EventSource](https://html.spec.whatwg.org/multipage/server-sent-events.html#the-eventsource-interface),
[WebSocket send](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send).
