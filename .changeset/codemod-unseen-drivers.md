---
'@gyral/codemod': patch
---

The codemod reports two kinds of driver candidate it used to leave without a word (gyral-0dj).
A record of drivers built away from `provideDrivers` and `el.drivers` (returned from a function,
passed in `defineStore({ drivers })` options or to another function) is listed, to make a list
by hand if nothing reads it by key; test files keep their records unreported. And
`subscription('feed', …)` is listed when the module imports a binding named `feed` (naming where
from), or declares a `feed` token where the rewrite can't pass it (inside a function, or with
`let`). A string name with its own implementation stays a documented form and isn't reported.
An entry imported from another module now names that module.
