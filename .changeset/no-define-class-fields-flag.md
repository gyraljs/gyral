---
'create-gyral': patch
'@gyral/mcp': patch
---

New apps' `tsconfig.json` no longer sets `useDefineForClassFields: false`, a leftover from when
Gyral rendered with Lit (Gyral's classes use `#private` fields and need no particular field
semantics), and `@gyral/mcp`'s snippet checker drops it from its defaults. Existing apps can
remove the line.
