---
'@gyral/core': patch
---

The Vite preset's component scan (`gyralVitePreset({ components })` and the generated
`.gyral/elements.d.ts`) now skips `define()` calls inside comments and inside string, template and
regular expression literals, so a code sample in a string, a doc comment or a test fixture no
longer registers a tag that doesn't exist or maps a tag to the wrong module. Real calls are found
as before, including the curried `define<State, Msg>()('tag', …)` form and calls inside a
template's `${…}`.
