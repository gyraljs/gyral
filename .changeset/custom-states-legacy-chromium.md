---
'@gyral/core': patch
---

Custom states (`spec.states`) no longer throw after every render in Chromium 90–124, which have `CustomStateSet` but accept only `--`-prefixed names; states are skipped there (an ADR 0003 enhancement), as in browsers without custom states.
