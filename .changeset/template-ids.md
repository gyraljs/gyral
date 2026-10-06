---
'@gyral/core': patch
---

Production client builds no longer carry template ids: the template compiler leaves them out
of the hoisted template objects, and the renderer compares templates by object identity there
(about a fifth less compiled template code gzip: 10.32 → 8.27 KiB on a 210-template corpus).
SSR and development builds keep their ids (development markers, collision checks). One visible
difference: identical markup at call sites in two modules is now two templates in production,
so switching between them replaces the instance instead of patching it.
