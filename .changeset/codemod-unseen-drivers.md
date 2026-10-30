---
'@gyral/codemod': patch
---

The codemod reports the driver candidates it can't see whole (gyral-0dj), where it was silent
before. `subscription('feed', …)` with no `feed` token in its module is listed: the token may be
declared in another module, so import it and pass it by hand (when the module imports `feed`,
the report names where from). A record of drivers built away from `provideDrivers` and
`el.drivers` (returned from a function, passed in `defineStore({ drivers })` options or to
another function) is listed too, to make a list by hand if nothing reads it by key. An entry
imported from another module names that module. Test files still keep their records unreported.
