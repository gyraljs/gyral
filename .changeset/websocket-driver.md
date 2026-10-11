---
'@gyral/http': patch
---

Add the optional @gyral/http/websocket entry with explicitly owned native connections,
typed receive/send codecs, bounded outgoing buffering, close metadata and cancellation
cleanup. Reconnection uses the existing opt-in retry wrapper; no offline queue or replay.
Imports and factories are safe on the server.
