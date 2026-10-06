---
'@gyral/core': minor
---

`renderOnFrame` (spec field): messages from bursty sources (a WebSocket feed, sensors) render in
the next animation frame, once for all of them, instead of in the microtask flush; reducers still
run at once, and `'StoreChanged'` covers store changes. Pages without frames render from a 100 ms
timer, so `settled()` never stalls. The microtask flush stays the default (flush-timing spike,
docs/design-docs/view/04-scheduler.md).
