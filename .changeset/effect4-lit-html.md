---
'@gyral/core': minor
'@gyral/devtools': minor
'@gyral/http': minor
'@gyral/mcp': minor
'@gyral/router': minor
'@gyral/ssr': minor
'@gyral/testing': minor
'@gyral/time': minor
'create-gyral': minor
---

Internals now run on Effect 4 (about half the bundle size: a counter app drops from about 49 KiB
to 24 KiB gzipped). No public API change. Development builds warn once when a lit-html with the
`repeat()` leak (3.3.1 or later, lit/lit#5298) is loaded; pin lit-html to 3.3.0 with an override
until it is fixed upstream (docs/references/consumer-setup.md).
