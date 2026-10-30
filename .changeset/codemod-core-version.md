---
'@gyral/codemod': patch
---

The codemod leaves the modules of a package whose `@gyral/core` is older than the release, and
reports each one it would have rewritten (gyral-w2j): "left as is: this package's @gyral/core is
0.3.0 (installed for frameworks/gyral-0.3.0/package.json), and the 0.3.8 rewrites need 0.3.8".
Before, it rewrote them too, so a package still on 0.3.0 got `gyral()`, which 0.3.0 doesn't
export. Upgrade and install `@gyral/*` first, then run the codemod. The package is the module's
nearest `package.json`; its core is the one Node finds from there, else the lowest version its
declared range allows. A module whose core it can't tell is rewritten as before.
