---
'@gyral/core': patch
---

New element hook `cssVars({ '--name': value })`: sets the named custom properties with
`style.setProperty` and removes those dropped (or set to `null`, `undefined` or `false`) since the
last call, leaving other inline styles alone. CSSOM writes are allowed by a Content-Security-Policy
whose `style-src` has no `'unsafe-inline'`, where a `style` attribute is blocked. Client only:
give each property a default in the stylesheet (`var(--name, 0)`) for the server-rendered page.
Apps that don't import it don't bundle it.
