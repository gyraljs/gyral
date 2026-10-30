---
'@gyral/codemod': patch
---

The codemod leaves a package whose `@gyral/core` is older than the release its transforms
migrate from, and reports it once (gyral-w2j): "left as is: this package's @gyral/core is 0.3.0
(installed), and the 0.3.8 rewrites start from 0.3.7: migrate it to 0.3.7 first". Before, it
rewrote it too, so a package still on 0.3.0 got `gyral()`, which 0.3.0 doesn't export. The 0.3.8
transforms start from 0.3.7, so they run before or after you install 0.3.8, as before. The
package is the module's nearest `package.json`; its core is the one Node finds from there, else
the lowest version its declared range allows. A module whose core it can't tell is rewritten.
