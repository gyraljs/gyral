---
'@gyral/time': patch
---

Remove completed delays' abort listeners and stop timer streams when an emission aborts
the command, including the initial synchronous `every()` emission.
