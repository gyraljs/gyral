---
'@gyral/mcp': patch
---

`check_snippet` no longer crashes with `ts.convertCompilerOptionsFromJson is not a function` in
a project with TypeScript 7, which exposes no compiler API: it says it needs TypeScript 5 or 6
and to run the project's own typecheck instead. The optional `typescript` peer is now
`>=5.0 <7`.
