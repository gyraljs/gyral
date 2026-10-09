---
'@gyral/core': patch
'@gyral/testing': patch
---

`virtualTime()` works in a Node test project: it fakes `requestAnimationFrame` only where the
platform has it, so model and driver tests that need no DOM can control timers. In core,
`scriptSafeJson` moved to its own module, so a multi-page app that uses the head model no
longer gets the store registry as an extra shared chunk on every page (about 0.3 KiB gzip per
page in a measured app).
