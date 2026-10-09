---
'@gyral/core': patch
'@gyral/testing': patch
---

`call(selector, method, ...args)` is a command that calls a method on an element of the
component's own tree after the render (play a video, reset a widget), replacing refs and request
arrays a child replays. Its arguments must be plain data. A missing element or method, or a
method that throws or rejects, is reported through the error channel (G0085). `callsIn(commands)`
in `@gyral/testing` reads the requests in model tests.
