---
'@gyral/core': patch
---

Props that receive an equal value no longer re-render or send `PropsChanged`: `prop.json` compares the JSON, so a parent binding a fresh object each render is fine, and `prop.json`/`prop.value` take an `equals(old, new)` option. `prop.value` still compares with `Object.is` by default.

Behavior change: a `prop.json` prop set to an equal value (same JSON) no longer re-renders or sends `PropsChanged`; `Prop` has a required `equals`, so hand-written prop definitions add one.
