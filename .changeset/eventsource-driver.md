---
'@gyral/http': patch
---

Add the optional @gyral/http/sse entry with a native EventSource driver. Decode default and
named events with Standard Schema, preserve event IDs, report state/decode/terminal failures,
and close resources on cancellation. Keep native reconnection and Last-Event-ID behavior.
Imports and factories are safe on the server.
