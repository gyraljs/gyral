---
'@gyral/core': patch
---

Template rule 14: a known HTML boolean attribute (`selected`, `checked`, `disabled`, `open`,
`required`, `multiple`, `muted`, …) bound as `name=${…}` is an error in the compiler, the
development runtime and `gyral/template`, with a message pointing to `?name=${…}`. Any string,
`"false"` included, turns a boolean attribute on, so `<option selected=${on}>` always selected
the option.

Behavior change: templates that bound a boolean attribute as a string now fail to compile; write
`?name=${…}` instead.
