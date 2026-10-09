---
'@gyral/core': patch
'@gyral/ssr': patch
'@gyral/devtools': patch
---

Secret form fields are never sent back. `defineForm(schema, { secret: ['card', 'cvc'] })` lists
them, and any field whose name contains `password` or `passcode` is secret without being listed.
They are left out of `IntentRejected.values` (client `form()`, no-JS `formAction` and
`rejectWith`) and `definition.values()`; JSON 422 answers carry no values at all. Development
builds warn once for an unlisted field whose name looks secret (`token`, `secret`, `card`,
`cvc`, `cvv`, `ssn`, `pin`), and the devtools timeline shows secret fields as `[secret]`.

Behavior change: a rejection no longer echoes password-like fields, which `formAction` used to
put back into the page on the no-JS path. Apps that stripped secrets by hand can delete that code.
