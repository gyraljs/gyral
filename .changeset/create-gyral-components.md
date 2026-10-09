---
'create-gyral': patch
---

The `ssr` template loads components automatically (`gyralVitePreset({ components: true })` and
`renderPage({ components })`), so it has no client entry, and its dev server is
`gyralDevServer`.
