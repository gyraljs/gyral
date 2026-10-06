---
'@gyral/core': patch
---

Compiled templates are smaller: part tables are tuples with numeric kinds and `server` is written
only when true (about a quarter less template code raw; every example's bundle shrinks by
35-97 B gzip). Nothing decodes them at runtime; template ids are unchanged.
