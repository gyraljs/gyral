---
'@gyral/core': patch
---

The docs say two costs plainly (gyral-crt). `subscription(…, { coalesce: 'microtask' | 'frame' })`
delays the first value too, by a microtask or a frame, so nothing arrives in the same turn as
`emit`: a driver's unit test that checks right after `emit` awaits one first. And `on()` is a
module of its own, about 0.43 KiB gzip, paid once per app on its first use; the
`gyral/prefer-built-in` warnings that suggest it now say so, so an app weighing bytes can decide.
