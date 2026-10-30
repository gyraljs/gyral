---
'@gyral/mcp': patch
---

The docs and the bundled skill no longer overstate render skipping (gyral-4rp). It helps only
when `update` returns the same state: a message that carries a new object each time (a game's
HUD snapshot, a sensor reading) still renders. Keep a compare that stops a high-rate source from
sending messages, in the driver or as the subscription's `equals` and `select`; the 0.3.8 notes
had listed one such compare as a workaround to remove.
