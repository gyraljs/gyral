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

The distinct bidirectional driver uses native WebSocket, typed incoming/outgoing codecs,
explicit connection ownership and buffer limits. Reconnection uses the existing opt-in
retry wrapper; there is no automatic offline queue or replay. Its detailed API is specified
before implementation below.

Sources: [EventSource](https://html.spec.whatwg.org/multipage/server-sent-events.html#the-eventsource-interface),
[WebSocket send](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send).
