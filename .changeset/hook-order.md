---
'@gyral/core': patch
---

Element hooks run after the whole update has rendered, children first: a parent's hook sees the
child components it renders already updated, so it can measure a child's list or scroll to a
child's row. `defineHook({ client, update: 'always' })` runs `client` on every render, not only
when an argument changed. The ordering code is installed by `defineHook`, so apps without hooks
don't bundle it (about 0.3 KiB gzip for apps with hooks).

Behavior change: hooks no longer run right after their own component's render but once every
component in the update has rendered, children first; each component's hooks still run in
document order.
