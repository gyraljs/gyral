---
'@gyral/codemod': patch
---

New package: `npx @gyral/codemod 0.3.8` rewrites an app's source for 0.3.8's APIs (gyral-337.4).
`gyralVitePreset(options)` becomes `plugins: [gyral(options)]`; driver records whose keys are
their drivers' names become lists (`provideDrivers(root, [feed.provide(run)])`, outside test
files); and `subscription('feed', fn)` becomes `subscription(feed, fn)` when the module declares
the `feed` token. It rewrites only what it can prove safe and reports every candidate it leaves,
with `file:line` and the reason. It writes only into a clean git working tree (`--force`
overrides), `--dry` prints a unified diff instead, and a second run changes nothing. It parses
with `@babel/parser`, never the app's TypeScript, and imports no Gyral package, so it runs on any
app.
