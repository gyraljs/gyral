---
'@gyral/core': patch
---

Errors go through one channel (ADR 0024). Every failure Gyral catches becomes a `GyralError`
(exported, with `component`, `phase`, `msg` and the thrown value as `cause`): it shows in the
devtools timeline, is dispatched on the failing host as a bubbling, composed, cancelable
`ErrorEvent('error')` that a parent can catch with `data-intent-on="error"` and claim with
`preventDefault()`, reaches the component's new `error(failure, state)` spec field (for `init`
and view failures) or optional `Errored` reducer (update, parse and command failures), and is
reported with `reportError` unless claimed. A reducer that throws changes nothing. Fixed: a
store subscriber that throws no longer keeps the other subscribers stale or the store's commands
from running; an element hook that throws no longer skips the other hooks of the render; a
failed `PropsChanged` is sent again with the next render; an async parser's reducer failure is
no longer an unhandled rejection. New codes G0073–G0078.

Behavior change: failures that were only logged now reach `window`'s `error` event (test runners
such as Vitest fail on them; use `collectErrors()` from `@gyral/testing`); a driver failure
without `onFailure` is an error, not a warning; a throwing `init`, synchronous parser or intent
reducer no longer escapes as an exception; `el.send()` reports a reducer failure instead of
throwing; a store reducer failure no longer throws to the sender; G0031, G0040 and G0041 have new
texts; `Errored` is a framework message name.
