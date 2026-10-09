---
'@gyral/core': patch
'@gyral/router': patch
'@gyral/ssr': patch
'@gyral/testing': patch
'@gyral/time': patch
'@gyral/devtools': patch
'@gyral/http': patch
'@gyral/mcp': patch
'create-gyral': patch
---

Every export was reviewed before 0.3.1 locks the public API, and
`docs/references/public-api-0.3.1.md` now lists every export of every entry point with its
status; a check fails when the list and the packages disagree, or when a value is exported
without documentation. What only Gyral's own packages share with core moved to
`@gyral/core/internal`, which is not part of the public API and not covered by semver.

Behavior change: these are no longer exported (the migration guide gives the replacement for
each):

- `@gyral/core`: `StoreRegistry` and `withStoreScope` (now from `@gyral/core/server` only);
  `headEntries`, `HEAD_ATTRIBUTE`, `HeadEntry`, `scriptSafeJson`, `STORE_SEND`,
  `StoreSendInput`, `STORE_SEED_ATTRIBUTE`, `warnJsonHazard`, `formFields`,
  `formDataToObject`, `intentRejectedSchema`, `runInit`, `ISLAND_ATTRIBUTE`, `devtoolsEnabled`,
  `devtoolsLiveComponents` (internal); `isLightComponent`, `findInScope`.
- `@gyral/core/vite`: everything but `gyralVitePreset`, `gyralTemplateCompiler`,
  `gyralClientOnly` and their option types.
- `@gyral/core/eslint`: `templateRule`, `rowPurityRule`, `unusedIntentRule` (use the plugin).
- `@gyral/router`: `capturedUrl`. `@gyral/testing`: `customElementsIn`, `undefinedElementsIn`.
  `@gyral/time`: `makeTime`, `TimeOptions`; `@gyral/time/delay`: `makeDelayTime`.
- `@gyral/devtools`: everything but `mountDevtools` and its types. `@gyral/mcp`: everything
  but `createServer`, `loadCorpus`, `refreshDocs` and the corpus types. `create-gyral`:
  everything but `parse`, `scaffold`, `manifest` and their types.
