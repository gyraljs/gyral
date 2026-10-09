---
'@gyral/ssr': patch
---

`gyralDevServer({ entry, app, state?, port?, hmrPort?, origin?, vite? })` in `@gyral/ssr/node`:
the development server of a server-rendered app. Vite serves client modules and HMR in
middleware mode; every other request loads the server module through Vite and streams the
response; `state` survives module reloads; a render error answers 500 with Vite's error
overlay. Vite is an optional peer dependency, loaded on first use.
