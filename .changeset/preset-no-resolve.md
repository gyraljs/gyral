---
'@gyral/core': patch
---

`gyralVitePreset()` no longer returns an empty `resolve: { dedupe: [] }` (a leftover from when it
deduped Lit), and `GyralViteConfig` loses that field. Spreading the preset is unchanged; a config
that read `gyralVitePreset().resolve` can drop it.
