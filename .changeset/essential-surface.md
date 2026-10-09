---
'@gyral/core': patch
'@gyral/ssr': patch
'@gyral/router': patch
'@gyral/time': patch
'@gyral/testing': patch
'@gyral/http': patch
'@gyral/devtools': patch
'@gyral/mcp': patch
---

The essential surface (gyral-1zd.24): the public API keeps what apps use, and folds duplicates.
`defineHook` takes an optional `dispose` (its tracking is bundled only when a module names
`dispose`); `@gyral/time/delay` is part of `@gyral/time` (delay-only apps keep their size);
`redirectedTo` lives in `@gyral/http` and `resetDocumentStores` in `@gyral/testing`;
`@gyral/ssr` exports `styleHashes`.

Behavior change: removed from the public API (each one is a type error at the import, and
docs/references/migrating-0.3.0-to-0.3.1.md "The essential surface" gives the fix):
`defineDisposableHook`, `capturePointer`, `labelledBy`, `random`/`randomInt`/`randomDriver`/
`toInt`, `emit` (use `outputs<Out>()`), the `events` spec field, the internal constants
(`STORES_ELEMENT`, `DRIVERS_ELEMENT`, `LIGHT_ATTRIBUTE`, `DEVTOOLS_GLOBAL`, `invokersSupported`,
`jsonHazard`, `HydrationMismatch`) and the devtools protocol types; `@gyral/core/server` is
internal; `page`, `renderToStream`, `clientAssets`, `clientEntryFromManifest`, `cacheHeaders`
and `staticFileFor` from `@gyral/ssr`; `back`, `forward` and `go` from `@gyral/router`;
`animationFrames` from `@gyral/time`; `@gyral/testing/arbitraries`. The small helpers among
them are recipes in the agent skill.
