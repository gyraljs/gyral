---
'@gyral/mcp': patch
---

Depend on zod 4.6.7, which fixes GHSA-mrhx-c7xc-m3w5: validating an oversized constrained
collection could exhaust memory (gyral-337.8). The server's tool schemas have no collections and
it caps request bodies at 16 KiB, so it wasn't reachable, but security scanners flagged the
exact 4.6.5 pin.
