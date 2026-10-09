---
'@gyral/core': patch
---

`keyed(key, value)` renders a value and recreates it, DOM and nested component state included,
whenever its key changes: a form cleared after sending, a CSS animation restarted, a child
reset to its `init`. It's a one-row `each`, so it renders on the server and hydrates like a
list, and apps that don't import it don't pay for it. It replaces the one-item `each([key], …)`
pattern.
