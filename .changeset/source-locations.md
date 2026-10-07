---
'@gyral/core': patch
---

Development errors name the template's source location. In development, runtime templates
record their call site, so a template rule error (`at src/cart.ts:12:5`) and a hydration mismatch
(`(template at src/cart.ts:12:5)`) point at the `html` call. Under Vite the preset's new
`gyral:template-locations` plugin (dev server and Vitest only) gives exact positions; elsewhere
they come from a stack trace. Production builds are unchanged.
