---
'@gyral/core': patch
---

Dialogs and command intents in installed component libraries now work in production builds. A published library ships its templates compiled, and the build's feature scan only recognized `?modal=`, `?popover-open=` and a bound `data-intent-on` in source markup, so the reduced `gyral-compiled` runtime left their code out and a library's `<dialog ?modal=…>` silently never opened (development was unaffected). The scan now reads the compiled forms too. If you removed the `gyral-compiled` condition to work around this, you can restore it. A production build that still runs one of these bindings without its code now logs `Gyral G0069` instead of failing silently.
