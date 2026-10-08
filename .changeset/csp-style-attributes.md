---
'@gyral/core': patch
---

`style` attributes work under a strict Content Security Policy on the client. Bindings
(`style=${…}`, `style="--w: ${w}px"`) are now written through the CSSOM (`el.style.cssText`)
instead of `setAttribute('style', …)`, which a `style-src` without `'unsafe-inline'` blocks;
static `style="…"` attributes in templates are applied the same way when an instance is created
(Firefox blocks them in a `<template>`'s HTML). Hydration writes a server-rendered `style`
attribute the policy blocked again through the CSSOM, so the element looks right once it
hydrates. Server output is unchanged: under a strict policy the server's `style` attributes
still miss the first paint (use classes or custom properties with a stylesheet fallback, or
allow known values with `'unsafe-hashes'`; see view/08-styles.md "Style attributes under a
strict CSP"). A client-written `style` attribute now reads back as the CSSOM serializes it
(`color: red;`). About 30 B gzip in the initial bundle, 30 B more in the hydration chunk.
