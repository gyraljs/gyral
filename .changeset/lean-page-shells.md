---
'@gyral/core': patch
---

Leaner page shells. A `server` template (a document shell such as `@gyral/ssr`'s `page()`) is
never hydrated, so the server no longer writes anchor comments (`<!---->`) for it or for `raw()`
values in its holes; templates nested in a shell keep theirs. The whitespace rules treat
`<head>`, `<meta>`, `<link>`, `<base>` and `<title>` as block-level edges and drop all
whitespace-only text inside `<head>`. Ids of templates with those tags change (the same in the
compiler, the browser and the server).
