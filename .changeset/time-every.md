---
'@gyral/time': patch
---

`every(ms, (now) => msg, key?)` sends `Date.now()` at once and then every `ms` (virtual under
`virtualTime()`), and is made for `subscriptions`.

Behavior change: `periodic(ms, (ticks) => msg)` is removed; use `every` and count from the first
time it sends.
