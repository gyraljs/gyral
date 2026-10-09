---
'@gyral/core': patch
'@gyral/ssr': patch
---

Automatic component loading: `gyralVitePreset({ components: true })` gives every component
defined under `src/` its own module behind a small loader and writes a components manifest, and
`renderPage({ components })` links exactly the components a page rendered (their modules,
preloaded, and the loader) after the body; a page that rendered none loads no JavaScript.
`componentsFromManifest()` reads a build, and `productionServer` hands `components` to
`createApp`. Core's server render collects the tags it writes (`tags` option).

Behavior change: `productionServer` no longer requires a client entry when the build has a
components manifest, so `AppAssets.clientEntry` is `string | undefined`.
