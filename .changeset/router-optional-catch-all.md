---
'@gyral/router': patch
---

Support optional named route segments and named trailing catch-all arrays. Keep native,
fallback and server matching consistent, encode catch-all values segment by segment, and
reject href parameters that are missing, malformed or ambiguous.

Behavior change: href now throws for unknown route names, missing required parameters,
empty or dot-segment values and wrongly shaped catch-all arrays. Supply valid parameters
rather than relying on a malformed URL being generated.
