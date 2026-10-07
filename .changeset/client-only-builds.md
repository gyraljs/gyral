---
'@gyral/core': patch
---

New opt-in client-only builds for apps no server renders: `gyralVitePreset({ clientOnly: true })`
(or the `gyralClientOnly()` plugin) resolves core with the new `gyral-client-only` condition in
the browser environment, so the bundle carries no hydration code: no seed reading and no
hydration chunk, and with no other `import()` Vite's preload helper goes too (hello-world: 8.9 →
7.9 KiB gzip initial, 11.3 → 7.9 KiB all chunks). The invoker-command fallback stays only when a
module, dependencies included, may make a component listen for `command` intents (a
`data-intent-on="command"`, a bound `data-intent-on`, `events: ['command']`, or `raw()` markup);
development always keeps it. Server-rendered markup met by a client-only build renders fresh,
replacing the server's (development warns once). Apps without the option are unchanged. See
view/07-hydration.md "Client-only builds".
