---
'@gyral/core': patch
'@gyral/devtools': patch
'@gyral/http': patch
'@gyral/router': patch
'@gyral/ssr': patch
'@gyral/testing': patch
'@gyral/time': patch
---

Gyral's packages take `@gyral/core` as a peer at their exact version (gyral-337.5, ADR 0033),
so a package manager never installs a second core for them: the app's copy is used, and a
mismatch shows at install time (pnpm reports the unmet peer, npm stops with ERESOLVE). Give
every `@gyral/*` package the same version.

Each package also checks core's version when it loads: another release throws G0016 in
development, naming both versions, and logs the coded warning in production. A new guide,
"Publishing a component library", says how third-party libraries list core: a caret peer, and
public entry points only.
