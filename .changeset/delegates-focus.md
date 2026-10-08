---
'@gyral/core': patch
---

`shadow` now also takes `{ delegatesFocus: true }`: the component's shadow root delegates focus, so focusing the host (or a parent's `focus('my-child')` command) lands on its first focusable element. The server writes `shadowrootdelegatesfocus` on the declarative shadow root, so hydrated hosts behave the same.
