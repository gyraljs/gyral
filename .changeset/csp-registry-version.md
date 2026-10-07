---
'@gyral/core': patch
'@gyral/ssr': patch
---

`renderPage({ csp: options })` caches its header on a server registry version instead of the
number of styled components, so any registration (and with it any change to the components'
CSS) rebuilds it. `@gyral/core/server` exports that version as `registryVersion()`.
