---
'@gyral/core': patch
---

New `subscription(name, (emit, { input, signal, fail }) => unsubscribe, options?)`: a streaming
driver over a source Gyral doesn't own (TC39 signals, Redux-style stores, XState actors,
WebSocket feeds). It emits until the command is switched away or the component disconnects,
then calls the returned unsubscribe (a function or `{ unsubscribe() }`); `fail(error)` ends it
through `retry`, `toError` and `onFailure`. The lane policy defaults to `'switch'`. The skill's
new `references/outside-stores.md` has recipes for signals, a Redux-style store, a store
provided per page and a WebSocket.
