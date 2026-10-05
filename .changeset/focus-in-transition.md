---
'@gyral/core': patch
---

`focus()` returned by a reducer whose update renders inside a View Transition now runs after
the new view has rendered, instead of before it (it used to warn "matched no focusable element").
