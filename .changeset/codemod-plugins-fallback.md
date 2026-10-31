---
'@gyral/codemod': patch
---

`npx @gyral/codemod 0.3.8` rewrites `...(gyralVitePreset(o).plugins ?? [])` to `...gyral(o)`
(gyral-68h). It wrote `...(gyral(o) ?? [])` before: valid, but the fallback is dead, since
`gyral()` always returns an array. A `|| []` fallback goes the same way. If you already ran the
codemod, you can delete the `?? []` and its parentheses by hand.
