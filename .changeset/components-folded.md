---
'@gyral/core': patch
'@gyral/ssr': patch
---

Automatic component loading works when a component's module is bundled into another chunk (the
entry, or a component that imports it statically): `componentsFromManifest`, and so
`productionServer` at startup, no longer throws "… is not an entry in the Vite manifest"; the
tag preloads the chunk its module is in. Components defined through a wrapper can be listed:
`gyralVitePreset({ components: { modules: { 'member-form': 'src/forms/member.ts' } } })`.
