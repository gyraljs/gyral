---
'@gyral/core': patch
'create-gyral': patch
---

`gyralVitePreset()` writes `.gyral/elements.d.ts`, an `HTMLElementTagNameMap` entry for every
exported two-call `define()` component in `src`, at the start of a dev server, build or test
run and again when a source file changes. The `gyral-types` bin writes the same file for type
checks that run without Vite. Apps can delete their hand-written
`declare global { interface HTMLElementTagNameMap … }` blocks; gitignore `.gyral/` and add
`".gyral/elements.d.ts"` to tsconfig `include`. Options: `types: { dirs, out }`, or `false`.
create-gyral's templates use it (`"typecheck": "gyral-types && tsc --noEmit"`).
