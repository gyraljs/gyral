---
'@gyral/core': patch
---

Props that receive an equal value no longer re-render or send `PropsChanged`: `prop.json` compares the JSON, so a parent binding a fresh object each render is fine, and `prop.json`/`prop.value` take an `equals(old, new)` option. `prop.value` still compares with `Object.is` by default.
