---
'@gyral/ssr': patch
---

`renderPage({ components })` no longer links a module twice. The components loader can import
the client entry, so a component bundled into the entry preloaded the entry's whole graph after
the body, repeating every `<link rel="modulepreload">` the head already wrote from
`modulepreload`. The tail after the body now leaves out each module, stylesheet and script the
page's head links (`modulepreload`, `stylesheets`, `scripts`), never links one of its own URLs
twice, and keeps the order otherwise. This holds for `renderPage` (streamed or rendered to a
string first), `renderToString` of a `page()`, and so for `prerender`, `productionServer` and
`gyralDevServer` apps. Apps that filtered `components` against `modulepreload` to avoid the
duplicates can pass both lists unchanged.
