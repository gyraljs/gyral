---
'@gyral/core': patch
---

A parser that returns `undefined` synchronously now declines the event: the next element outward with an intent for the same event gets it, up to the component's root. A container's keyboard shortcuts and its fields' own keys can live together without `composedPath()` filtering. Behavior change: an outer intent can now receive events an inner parser ignored; async parsers never decline.
