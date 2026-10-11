---
'@gyral/core': patch
---

Reduce automatic component loading overhead by keeping statically retained app-entry components
in the entry and omitting repeated JavaScript preload dependency lists from the loader. Preserve
Vite's CSS loading and app preload configuration. Wait for entry-defined hosts when discovering
components in their shadow roots.
