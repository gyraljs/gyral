---
'@gyral/core': patch
---

`settled()` now waits until messages stop arriving: every message dispatched to a component or a
store restarts its quiet window (8 microtask turns), even when the component already rendered
inside it. Chains such as a store notifying in a microtask, a streaming driver re-arming in one,
and a reducer answering with the next command are waited for to the end, so tests need no
`await Promise.resolve()` loops before `settled()`. Commands that never end (store watches,
sockets) don't block it, and it still never waits for or advances timers. It rejects when
messages never stop (more than 10,000 flushes or busy turns), like the loop guard; a finite burst
of hundreds of messages settles.

Behavior change: `settled()` waits longer (until messages stop, not 4 turns), and rejects with G0034 for a stream that emits without pause.
