---
'create-gyral': patch
---

The basic template's `AGENTS.md` no longer says state must be JSON: only server-rendered state
travels in hydration seeds, so client-only components may hold other values. The skill and docs
also explain typing intent parsers and `child()` mappers (no whole-union annotation) and using
`null` for an explicit "nobody" in a prop with a default (defaults replace only `undefined`).
