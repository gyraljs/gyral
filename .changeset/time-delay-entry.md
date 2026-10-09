---
'@gyral/time': patch
---

`delay` and `debounce` run on a delay-only driver (also named `time`, taking the same input), so
an app that only delays leaves the `every` code out of its bundle (about 0.15 KiB gzip);
substitution, `inputsFor` and virtual time work unchanged.
