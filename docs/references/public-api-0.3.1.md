# Public API (0.3.1)

Everything the `@gyral/*` packages and `create-gyral` export, entry point by entry point, as of
0.3.1. This list is Gyral's semver promise: from 0.3.1 on, removing or changing an export listed
here as `documented` or `supporting type` takes a minor release (0.x) and a migration note.
`node scripts/public-api.mjs --check` (part of `pnpm invariants`) fails when an entry point and
this list disagree, or when a value is exported without documentation.

- **documented**: named in the agent skill, a spec, an ADR, `docs/references` or a package
  README (the first one is linked).
- **supporting type**: a parameter, option or result type of a documented API, so it can be
  named in annotations. Its doc comment describes it.
- **internal**: `@gyral/core/internal`, which Gyral's own packages (`@gyral/router`,
  `@gyral/ssr`, `@gyral/testing`, `@gyral/http`, `@gyral/devtools`) share with core. **Not part
  of the public API and not covered by semver**: any release may change or remove it. Apps
  never import it.

## Removed from the public API in 0.3.1

0.3.1 is the one release that may break 0.3.0's API (Gyral is still pre-release). Before it
locks the surface, every export was reviewed (gyral-1zd.6): what only Gyral's own packages use
moved to `@gyral/core/internal`, and what nothing outside its package uses is no longer exported.
A second pass (gyral-1zd.24) removed what apps rarely used or could write in a few lines
(now recipes) and folded duplicates.

| Export                                                                                                                                                                                                                                       | Was in                       | Now                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `StoreRegistry`, `withStoreScope`                                                                                                                                                                                                            | `@gyral/core`                | `@gyral/core/server` only (they were exported from both)                                                         |
| `headEntries`, `HEAD_ATTRIBUTE`, `HeadEntry`, `scriptSafeJson`, `STORE_SEND`, `StoreSendInput`, `STORE_SEED_ATTRIBUTE`, `warnJsonHazard`, `intentRejectedSchema`, `runInit`, `ISLAND_ATTRIBUTE`, `devtoolsEnabled`, `devtoolsLiveComponents` | `@gyral/core`                | `@gyral/core/internal` (no semver); apps use `Head`, `page()`, `setHead()`, `form()`, `submitForm()`             |
| `isLightComponent`, `findInScope`                                                                                                                                                                                                            | `@gyral/core`                | not exported                                                                                                     |
| `gyralTemplateLocations`, `gyralDependents`, `gyralDevServer`, `DEFAULT_TEMPLATE_SOURCES`, `GYRAL_PACKAGES`, `COMPILED_CONDITION`, `CLIENT_ONLY_CONDITION`, `CLIENT_CONDITIONS`, `SERVER_CONDITIONS`                                         | `@gyral/core/vite`           | not exported: `gyralVitePreset()` (or `gyralTemplateCompiler()`, `gyralClientOnly()`) sets them up               |
| `templateRule`, `rowPurityRule`, `unusedIntentRule`                                                                                                                                                                                          | `@gyral/core/eslint`         | not exported: use the plugin (`gyral.rules['template']`, `gyral.configs.recommended`)                            |
| `validateForm`, `formValues`, `formFields`, `formDataToObject`                                                                                                                                                                               | `@gyral/core`                | methods of the form definition: `definition.validate(data, intent)`, `definition.values(data)`                   |
| `capturedUrl`                                                                                                                                                                                                                                | `@gyral/router`              | not exported                                                                                                     |
| `customElementsIn`, `undefinedElementsIn`                                                                                                                                                                                                    | `@gyral/testing`             | not exported: `hydrated()` reports undefined elements                                                            |
| `makeTime`, `TimeOptions`; `makeDelayTime`                                                                                                                                                                                                   | `@gyral/time`, `/delay`      | not exported: commands always run on the `time` driver; substitute it by name (`time`, `delayTime`)              |
| `DevtoolsPanel`, `PANEL_TAG`, `PanelMsg`, `initialPanel`, `MAX_ROWS`, `ROW_KINDS`, `visibleRows`, `preview`, `receive`, `PanelState`, `Row`, `RowKind`, `Lane`                                                                               | `@gyral/devtools`            | not exported: `mountDevtools()` is the API                                                                       |
| `getDoc`, `parseLlmsFull`, `searchDocs`, `SearchHit`, `findApi`, `formatApi`, `listApi`, `ApiResult`, `checkSnippet`, `CheckResult`, `scaffold`, `validTag`, `Scaffold`, `ScaffoldFile`, `ScaffoldKind`                                      | `@gyral/mcp`                 | not exported: embed with `createServer`, `loadCorpus`, `refreshDocs` (the tools stay)                            |
| `isTemplate`, `TEMPLATES`, `USAGE`, `invalidPackageName`, `toPackageName`, `detectPackageManager`, `nextSteps`, `PackageManager`, `isEmptyDir`, `TEMPLATES_DIR`                                                                              | `create-gyral`               | not exported: `parse`, `scaffold` and `manifest` remain                                                          |
| `periodic`                                                                                                                                                                                                                                   | `@gyral/time`                | replaced by `every(ms, (now) => msg, key?)` (ADR 0025)                                                           |
| `defineDisposableHook`, `DisposableHookSpec`                                                                                                                                                                                                 | `@gyral/core`                | `defineHook({ client, dispose })`                                                                                |
| `capturePointer`, `labelledBy`, `random`, `randomInt`, `randomDriver`, `toInt`, `RandomInput`                                                                                                                                                | `@gyral/core`                | recipes in the agent skill (intent.md, view.md, effects-and-drivers.md)                                          |
| `emit`                                                                                                                                                                                                                                       | `@gyral/core`                | `outputs<Out>()`                                                                                                 |
| `redirectedTo`, `FormRedirected`                                                                                                                                                                                                             | `@gyral/core`                | `@gyral/http`                                                                                                    |
| `resetDocumentStores`                                                                                                                                                                                                                        | `@gyral/core`                | `@gyral/testing`                                                                                                 |
| `STORES_ELEMENT`, `DRIVERS_ELEMENT`, `LIGHT_ATTRIBUTE`, `DEVTOOLS_GLOBAL`, `invokersSupported`, `jsonHazard`, `HydrationMismatch`, `DevEvent`, `DevComponentRef`, `DevtoolsHook`, `CommandPhase`, `CommandTraceEvent`                        | `@gyral/core`                | `@gyral/core/internal` (no semver)                                                                               |
| everything (`render`, `renderToString`, `styleHashes`, …)                                                                                                                                                                                    | `@gyral/core/server`         | `@gyral/core/internal/server` (no semver); apps use `@gyral/ssr` (`renderPage`, `renderToString`, `styleHashes`) |
| `page`, `renderToStream`                                                                                                                                                                                                                     | `@gyral/ssr`                 | `renderPage()` (same options; its body is the chunked stream)                                                    |
| `clientAssets`, `clientEntryFromManifest`, `cacheHeaders`, `staticFileFor`                                                                                                                                                                   | `@gyral/ssr/static`          | `clientAssetsFromManifest()`; `productionServer`/`assetHandler`                                                  |
| `back`, `forward`, `go`                                                                                                                                                                                                                      | `@gyral/router`              | `command(router, { _tag: 'Traverse', delta })`                                                                   |
| `delay`, `debounce`, `delayTime` (the entry)                                                                                                                                                                                                 | `@gyral/time/delay`          | `delay`, `debounce` from `@gyral/time`                                                                           |
| `animationFrames`                                                                                                                                                                                                                            | `@gyral/time`                | `command(time, { _tag: 'Frames' }, …)`                                                                           |
| the entry (`arbitraries`, …)                                                                                                                                                                                                                 | `@gyral/testing/arbitraries` | removed                                                                                                          |

## Inventory

<!-- inventory:start -->

### `@gyral/core`

| Export                | Kind  | Status          | Documented in                                                                                          |
| --------------------- | ----- | --------------- | ------------------------------------------------------------------------------------------------------ |
| `AnyDriver`           | type  | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)                         |
| `AnyStore`            | type  | supporting type |                                                                                                        |
| `AnyStoreInstance`    | type  | supporting type |                                                                                                        |
| `call`                | value | documented      | [skills/gyral/references/outside-stores.md](../../skills/gyral/references/outside-stores.md)           |
| `CallInput`           | type  | supporting type |                                                                                                        |
| `changed`             | value | documented      | [skills/gyral/references/composition.md](../../skills/gyral/references/composition.md)                 |
| `child`               | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `ChildSource`         | type  | supporting type |                                                                                                        |
| `ChildValue`          | type  | documented      | [design-docs/view/03-lists.md](../design-docs/view/03-lists.md)                                        |
| `command`             | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `Command`             | type  | documented      | [skills/gyral/references/effects-and-drivers.md](../../skills/gyral/references/effects-and-drivers.md) |
| `CommandHandlers`     | type  | documented      | [design-docs/0006-effects-and-drivers.md](../design-docs/0006-effects-and-drivers.md)                  |
| `CommandInfo`         | type  | supporting type |                                                                                                        |
| `ComponentSpec`       | type  | documented      | [design-docs/0023-intent-name-inference.md](../design-docs/0023-intent-name-inference.md)              |
| `Concurrency`         | type  | documented      | [design-docs/0006-effects-and-drivers.md](../design-docs/0006-effects-and-drivers.md)                  |
| `css`                 | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `CssValue`            | type  | supporting type |                                                                                                        |
| `Ctx`                 | type  | documented      | [design-docs/view/05-element.md](../design-docs/view/05-element.md)                                    |
| `define`              | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `defineDriver`        | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `defineForm`          | value | documented      | [skills/gyral/references/forms.md](../../skills/gyral/references/forms.md)                             |
| `defineHook`          | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `Definer`             | type  | documented      | [design-docs/0023-intent-name-inference.md](../design-docs/0023-intent-name-inference.md)              |
| `defineStore`         | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `Driver`              | type  | documented      | [skills/gyral/references/effects-and-drivers.md](../../skills/gyral/references/effects-and-drivers.md) |
| `DriverContext`       | type  | documented      | [design-docs/0006-effects-and-drivers.md](../design-docs/0006-effects-and-drivers.md)                  |
| `DriverOverrides`     | type  | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)                         |
| `DriverToken`         | type  | supporting type |                                                                                                        |
| `each`                | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `Errored`             | type  | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `ErrorPhase`          | type  | documented      | [design-docs/0024-errors.md](../design-docs/0024-errors.md)                                            |
| `field`               | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `fieldErrors`         | value | documented      | [skills/gyral/references/anti-patterns.md](../../skills/gyral/references/anti-patterns.md)             |
| `FieldIssue`          | type  | supporting type |                                                                                                        |
| `FieldName`           | type  | supporting type |                                                                                                        |
| `focus`               | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `FocusOptions`        | type  | supporting type |                                                                                                        |
| `form`                | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `FormDefinition`      | type  | supporting type |                                                                                                        |
| `FormFields`          | type  | documented      | [skills/gyral/references/forms.md](../../skills/gyral/references/forms.md)                             |
| `FormOptions`         | type  | supporting type |                                                                                                        |
| `FormResult`          | type  | supporting type |                                                                                                        |
| `FormValue`           | type  | supporting type |                                                                                                        |
| `FormValues`          | type  | documented      | [design-docs/0008-forms.md](../design-docs/0008-forms.md)                                              |
| `GyralElement`        | type  | supporting type |                                                                                                        |
| `GyralElementClass`   | type  | documented      | [skills/gyral/references/composition.md](../../skills/gyral/references/composition.md)                 |
| `GyralError`          | value | documented      | [skills/gyral/references/errors.md](../../skills/gyral/references/errors.md)                           |
| `Head`                | type  | documented      | [skills/gyral/references/ssr.md](../../skills/gyral/references/ssr.md)                                 |
| `HeadLink`            | type  | documented      | [design-docs/0019-head-model.md](../design-docs/0019-head-model.md)                                    |
| `HeadMeta`            | type  | documented      | [design-docs/0019-head-model.md](../design-docs/0019-head-model.md)                                    |
| `HookAttributes`      | type  | supporting type |                                                                                                        |
| `HookResult`          | type  | supporting type |                                                                                                        |
| `HookSpec`            | type  | supporting type |                                                                                                        |
| `html`                | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `Hydrated`            | type  | documented      | [skills/gyral/references/anti-patterns.md](../../skills/gyral/references/anti-patterns.md)             |
| `HydrateStrategy`     | type  | supporting type |                                                                                                        |
| `IntentInput`         | type  | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `IntentNames`         | type  | documented      | [migrating-0.3.0-to-0.3.1.md](migrating-0.3.0-to-0.3.1.md)                                             |
| `IntentParser`        | type  | documented      | [skills/gyral/references/anti-patterns.md](../../skills/gyral/references/anti-patterns.md)             |
| `IntentRejected`      | type  | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `Intents`             | type  | documented      | [design-docs/0023-intent-name-inference.md](../design-docs/0023-intent-name-inference.md)              |
| `intentsOf`           | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `invalid`             | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `JsonValue`           | type  | documented      | [design-docs/0019-head-model.md](../design-docs/0019-head-model.md)                                    |
| `keyed`               | value | documented      | [skills/gyral/references/forms.md](../../skills/gyral/references/forms.md)                             |
| `ListResult`          | type  | documented      | [design-docs/view/03-lists.md](../design-docs/view/03-lists.md)                                        |
| `Next`                | type  | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `nothing`             | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `OUTPUT_EVENT`        | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `OutputEvent`         | type  | documented      | [skills/gyral/references/composition.md](../../skills/gyral/references/composition.md)                 |
| `outputs`             | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `OutputsOf`           | type  | documented      | [skills/gyral/references/composition.md](../../skills/gyral/references/composition.md)                 |
| `OutputSource`        | type  | supporting type |                                                                                                        |
| `ParserCtx`           | type  | documented      | [design-docs/view/05-element.md](../design-docs/view/05-element.md)                                    |
| `ParserFor`           | type  | documented      | [design-docs/0023-intent-name-inference.md](../design-docs/0023-intent-name-inference.md)              |
| `prop`                | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `Prop`                | type  | documented      | [migrating-0.3.0-to-0.3.1.md](migrating-0.3.0-to-0.3.1.md)                                             |
| `PropDeclarations`    | type  | supporting type |                                                                                                        |
| `PropGuard`           | type  | supporting type |                                                                                                        |
| `PropKind`            | type  | supporting type |                                                                                                        |
| `PropsChanged`        | type  | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `PropsOf`             | type  | documented      | [skills/gyral/references/components.md](../../skills/gyral/references/components.md)                   |
| `provideDrivers`      | value | documented      | [skills/gyral/references/anti-patterns.md](../../skills/gyral/references/anti-patterns.md)             |
| `raw`                 | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `RawResult`           | type  | supporting type |                                                                                                        |
| `retry`               | value | documented      | [skills/gyral/references/effects-and-drivers.md](../../skills/gyral/references/effects-and-drivers.md) |
| `RetryPolicy`         | type  | documented      | [design-docs/0006-effects-and-drivers.md](../design-docs/0006-effects-and-drivers.md)                  |
| `SeedCheck`           | type  | supporting type |                                                                                                        |
| `send`                | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `settled`             | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `ShadowOption`        | type  | supporting type |                                                                                                        |
| `Stateless`           | type  | documented      | [skills/gyral/references/components.md](../../skills/gyral/references/components.md)                   |
| `Store`               | type  | documented      | [skills/gyral/references/outside-stores.md](../../skills/gyral/references/outside-stores.md)           |
| `StoreChanged`        | type  | documented      | [skills/gyral/references/components.md](../../skills/gyral/references/components.md)                   |
| `StoreInstance`       | type  | supporting type |                                                                                                        |
| `StoreOverrides`      | type  | supporting type |                                                                                                        |
| `StoreReader`         | type  | supporting type |                                                                                                        |
| `StoreRef`            | type  | supporting type |                                                                                                        |
| `StoreResolver`       | type  | supporting type |                                                                                                        |
| `StoreSpec`           | type  | documented      | [design-docs/0006-effects-and-drivers.md](../design-docs/0006-effects-and-drivers.md)                  |
| `StoreUpdate`         | type  | supporting type |                                                                                                        |
| `Styles`              | type  | documented      | [design-docs/0001-mvi-parsed-intent.md](../design-docs/0001-mvi-parsed-intent.md)                      |
| `StyleSource`         | type  | supporting type |                                                                                                        |
| `subscription`        | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `SubscriptionContext` | type  | documented      | [design-docs/0006-effects-and-drivers.md](../design-docs/0006-effects-and-drivers.md)                  |
| `SubscriptionOptions` | type  | documented      | [design-docs/0006-effects-and-drivers.md](../design-docs/0006-effects-and-drivers.md)                  |
| `svg`                 | value | documented      | [skills/gyral/references/view.md](../../skills/gyral/references/view.md)                               |
| `Tagged`              | type  | documented      | [design-docs/0023-intent-name-inference.md](../design-docs/0023-intent-name-inference.md)              |
| `TemplateResult`      | type  | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `Unsubscribe`         | type  | documented      | [design-docs/0006-effects-and-drivers.md](../design-docs/0006-effects-and-drivers.md)                  |
| `Update`              | type  | documented      | [design-docs/0023-intent-name-inference.md](../design-docs/0023-intent-name-inference.md)              |

### `@gyral/core/internal/server`

| Export                | Kind  | Status   | Documented in |
| --------------------- | ----- | -------- | ------------- |
| `componentStyles`     | value | internal |               |
| `development`         | value | internal |               |
| `registryVersion`     | value | internal |               |
| `render`              | value | internal |               |
| `renderToString`      | value | internal |               |
| `ServerRenderOptions` | type  | internal |               |
| `StoreRegistry`       | value | internal |               |
| `styleHash`           | value | internal |               |
| `styleHashes`         | value | internal |               |
| `styleHashSync`       | value | internal |               |
| `StyleValues`         | type  | internal |               |
| `withStoreScope`      | value | internal |               |

### `@gyral/core/internal`

| Export                   | Kind  | Status   | Documented in |
| ------------------------ | ----- | -------- | ------------- |
| `CommandPhase`           | type  | internal |               |
| `CommandTraceEvent`      | type  | internal |               |
| `DevComponentRef`        | type  | internal |               |
| `DevEvent`               | type  | internal |               |
| `DEVTOOLS_GLOBAL`        | value | internal |               |
| `devtoolsEnabled`        | value | internal |               |
| `DevtoolsHook`           | type  | internal |               |
| `devtoolsLiveComponents` | value | internal |               |
| `DRIVERS_ELEMENT`        | value | internal |               |
| `emit`                   | value | internal |               |
| `HEAD_ATTRIBUTE`         | value | internal |               |
| `headEntries`            | value | internal |               |
| `HeadEntry`              | type  | internal |               |
| `HydrationMismatch`      | value | internal |               |
| `intentRejectedSchema`   | value | internal |               |
| `invokersSupported`      | value | internal |               |
| `ISLAND_ATTRIBUTE`       | value | internal |               |
| `isSecretField`          | value | internal |               |
| `jsonHazard`             | value | internal |               |
| `LIGHT_ATTRIBUTE`        | value | internal |               |
| `resetDocumentStores`    | value | internal |               |
| `runInit`                | value | internal |               |
| `scriptSafeJson`         | value | internal |               |
| `STORE_SEED_ATTRIBUTE`   | value | internal |               |
| `STORE_SEND`             | value | internal |               |
| `STORES_ELEMENT`         | value | internal |               |
| `StoreSendInput`         | type  | internal |               |
| `warnJsonHazard`         | value | internal |               |

### `@gyral/core/vite`

| Export                    | Kind  | Status          | Documented in                                                           |
| ------------------------- | ----- | --------------- | ----------------------------------------------------------------------- |
| `ComponentsOptions`       | type  | supporting type |                                                                         |
| `ElementTypesOptions`     | type  | supporting type |                                                                         |
| `gyralClientOnly`         | value | documented      | [design-docs/view/07-hydration.md](../design-docs/view/07-hydration.md) |
| `gyralTemplateCompiler`   | value | documented      | [consumer-setup.md](consumer-setup.md)                                  |
| `GyralViteConfig`         | type  | documented      | [migrating-0.3.0-to-0.3.1.md](migrating-0.3.0-to-0.3.1.md)              |
| `GyralViteOptions`        | type  | supporting type |                                                                         |
| `gyralVitePreset`         | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                    |
| `TemplateCompilerOptions` | type  | supporting type |                                                                         |

### `@gyral/core/compiled`

| Export        | Kind  | Status     | Documented in                                                           |
| ------------- | ----- | ---------- | ----------------------------------------------------------------------- |
| `compiled`    | value | documented | [design-docs/view/01-templates.md](../design-docs/view/01-templates.md) |
| `compiledSvg` | value | documented | [design-docs/view/01-templates.md](../design-docs/view/01-templates.md) |

### `@gyral/core/eslint`

| Export        | Kind  | Status     | Documented in                                                                              |
| ------------- | ----- | ---------- | ------------------------------------------------------------------------------------------ |
| `default`     | value | documented | [skills/gyral/references/anti-patterns.md](../../skills/gyral/references/anti-patterns.md) |
| `GyralPlugin` | type  | documented | [migrating-0.3.0-to-0.3.1.md](migrating-0.3.0-to-0.3.1.md)                                 |

### `create-gyral`

| Export            | Kind  | Status          | Documented in                                                            |
| ----------------- | ----- | --------------- | ------------------------------------------------------------------------ |
| `manifest`        | value | documented      | [packages/create-gyral/README.md](../../packages/create-gyral/README.md) |
| `Manifest`        | type  | supporting type |                                                                          |
| `Options`         | type  | supporting type |                                                                          |
| `parse`           | value | documented      | [packages/create-gyral/README.md](../../packages/create-gyral/README.md) |
| `Parsed`          | type  | supporting type |                                                                          |
| `scaffold`        | value | documented      | [packages/create-gyral/README.md](../../packages/create-gyral/README.md) |
| `ScaffoldOptions` | type  | supporting type |                                                                          |
| `Template`        | type  | documented      | [design-docs/view/01-templates.md](../design-docs/view/01-templates.md)  |

### `@gyral/devtools`

| Export            | Kind  | Status          | Documented in                                                                    |
| ----------------- | ----- | --------------- | -------------------------------------------------------------------------------- |
| `DevtoolsOptions` | type  | supporting type |                                                                                  |
| `mountDevtools`   | value | documented      | [skills/gyral/references/devtools.md](../../skills/gyral/references/devtools.md) |
| `MountedDevtools` | type  | supporting type |                                                                                  |

### `@gyral/http`

| Export               | Kind  | Status          | Documented in                                                                                          |
| -------------------- | ----- | --------------- | ------------------------------------------------------------------------------------------------------ |
| `csrfFromMeta`       | value | documented      | [skills/gyral/references/effects-and-drivers.md](../../skills/gyral/references/effects-and-drivers.md) |
| `FormRedirected`     | type  | documented      | [migrating-0.3.0-to-0.3.1.md](migrating-0.3.0-to-0.3.1.md)                                             |
| `get`                | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `HeaderSource`       | type  | supporting type |                                                                                                        |
| `http`               | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `HttpDriverOptions`  | type  | documented      | [design-docs/0022-http-opt-outs.md](../design-docs/0022-http-opt-outs.md)                              |
| `HttpError`          | type  | documented      | [skills/gyral/references/effects-and-drivers.md](../../skills/gyral/references/effects-and-drivers.md) |
| `HttpMethod`         | type  | supporting type |                                                                                                        |
| `HttpRequest`        | type  | documented      | [migrating-0.3.0-to-0.3.1.md](migrating-0.3.0-to-0.3.1.md)                                             |
| `makeHttpDriver`     | value | documented      | [skills/gyral/references/effects-and-drivers.md](../../skills/gyral/references/effects-and-drivers.md) |
| `redirectedTo`       | value | documented      | [migrating-0.3.0-to-0.3.1.md](migrating-0.3.0-to-0.3.1.md)                                             |
| `request`            | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `RequestHandlers`    | type  | supporting type |                                                                                                        |
| `retryableHttpError` | value | documented      | [skills/gyral/references/effects-and-drivers.md](../../skills/gyral/references/effects-and-drivers.md) |
| `submitForm`         | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `SubmitFormOptions`  | type  | supporting type |                                                                                                        |

### `@gyral/http/testing`

| Export                   | Kind  | Status          | Documented in                                                                         |
| ------------------------ | ----- | --------------- | ------------------------------------------------------------------------------------- |
| `fakeHttp`               | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                  |
| `FakeHttp`               | type  | supporting type |                                                                                       |
| `FakeHttpCall`           | type  | supporting type |                                                                                       |
| `FakeHttpOptions`        | type  | supporting type |                                                                                       |
| `FakeHttpResponderError` | value | documented      | [design-docs/0006-effects-and-drivers.md](../design-docs/0006-effects-and-drivers.md) |
| `FakeResponse`           | type  | supporting type |                                                                                       |

### `@gyral/mcp`

| Export         | Kind  | Status          | Documented in                                          |
| -------------- | ----- | --------------- | ------------------------------------------------------ |
| `ApiEntry`     | type  | documented      | [packages/mcp/README.md](../../packages/mcp/README.md) |
| `ApiKind`      | type  | supporting type |                                                        |
| `Corpus`       | type  | documented      | [packages/mcp/README.md](../../packages/mcp/README.md) |
| `createServer` | value | documented      | [packages/mcp/README.md](../../packages/mcp/README.md) |
| `DocPage`      | type  | documented      | [packages/mcp/README.md](../../packages/mcp/README.md) |
| `DocSection`   | type  | supporting type |                                                        |
| `Example`      | type  | documented      | [packages/mcp/README.md](../../packages/mcp/README.md) |
| `ExampleFile`  | type  | supporting type |                                                        |
| `loadCorpus`   | value | documented      | [packages/mcp/README.md](../../packages/mcp/README.md) |
| `refreshDocs`  | value | documented      | [packages/mcp/README.md](../../packages/mcp/README.md) |
| `SkillFile`    | type  | documented      | [packages/mcp/README.md](../../packages/mcp/README.md) |
| `ToolOptions`  | type  | supporting type |                                                        |

### `@gyral/router`

| Export            | Kind  | Status          | Documented in                                                                                          |
| ----------------- | ----- | --------------- | ------------------------------------------------------------------------------------------------------ |
| `AfterNavigation` | type  | supporting type |                                                                                                        |
| `listen`          | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `LocationLike`    | type  | supporting type |                                                                                                        |
| `makeRouter`      | value | documented      | [skills/gyral/references/effects-and-drivers.md](../../skills/gyral/references/effects-and-drivers.md) |
| `Matcher`         | type  | supporting type |                                                                                                        |
| `MemoryOptions`   | type  | supporting type |                                                                                                        |
| `navigate`        | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `NavigateOptions` | type  | supporting type |                                                                                                        |
| `Params`          | type  | supporting type |                                                                                                        |
| `RouteLocation`   | type  | documented      | [skills/gyral/references/effects-and-drivers.md](../../skills/gyral/references/effects-and-drivers.md) |
| `RouteMatch`      | type  | documented      | [skills/gyral/references/effects-and-drivers.md](../../skills/gyral/references/effects-and-drivers.md) |
| `router`          | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `RouterDriver`    | type  | supporting type |                                                                                                        |
| `RouterInput`     | type  | documented      | [design-docs/0019-head-model.md](../design-docs/0019-head-model.md)                                    |
| `RouterOptions`   | type  | supporting type |                                                                                                        |
| `RouterSnapshot`  | type  | documented      | [migrating-0.3.0-to-0.3.1.md](migrating-0.3.0-to-0.3.1.md)                                             |
| `routes`          | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                                   |
| `Routes`          | type  | supporting type |                                                                                                        |
| `RouteTable`      | type  | supporting type |                                                                                                        |
| `setHead`         | value | documented      | [skills/gyral/references/effects-and-drivers.md](../../skills/gyral/references/effects-and-drivers.md) |

### `@gyral/ssr`

| Export                  | Kind  | Status          | Documented in                                                                               |
| ----------------------- | ----- | --------------- | ------------------------------------------------------------------------------------------- |
| `ComponentAssets`       | type  | documented      | [skills/gyral/references/ssr.md](../../skills/gyral/references/ssr.md)                      |
| `ComponentModule`       | type  | supporting type |                                                                                             |
| `contentSecurityPolicy` | value | documented      | [skills/gyral/references/ssr.md](../../skills/gyral/references/ssr.md)                      |
| `CspDirectives`         | type  | supporting type |                                                                                             |
| `CspOptions`            | type  | documented      | [design-docs/0020-style-attribute-hashes.md](../design-docs/0020-style-attribute-hashes.md) |
| `formAction`            | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                        |
| `FormActionHandlers`    | type  | supporting type |                                                                                             |
| `FormReject`            | type  | supporting type |                                                                                             |
| `PageOptions`           | type  | documented      | [migrating-0.3.0-to-0.3.1.md](migrating-0.3.0-to-0.3.1.md)                                  |
| `rejectWith`            | value | documented      | [skills/gyral/references/forms.md](../../skills/gyral/references/forms.md)                  |
| `RenderOptions`         | type  | supporting type |                                                                                             |
| `renderPage`            | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                        |
| `renderToString`        | value | documented      | [skills/gyral/references/ssr.md](../../skills/gyral/references/ssr.md)                      |
| `seeOther`              | value | documented      | [skills/gyral/references/forms.md](../../skills/gyral/references/forms.md)                  |
| `styleHashes`           | value | documented      | [skills/gyral/references/ssr.md](../../skills/gyral/references/ssr.md)                      |
| `wantsJson`             | value | documented      | [skills/gyral/references/ssr.md](../../skills/gyral/references/ssr.md)                      |

### `@gyral/ssr/static`

| Export                     | Kind  | Status          | Documented in                                                                     |
| -------------------------- | ----- | --------------- | --------------------------------------------------------------------------------- |
| `AppAssets`                | type  | supporting type |                                                                                   |
| `assetHandler`             | value | documented      | [skills/gyral/references/ssr.md](../../skills/gyral/references/ssr.md)            |
| `AssetHandler`             | type  | supporting type |                                                                                   |
| `AssetHandlerOptions`      | type  | supporting type |                                                                                   |
| `ClientAssets`             | type  | documented      | [migrating-0.3.0-to-0.3.1.md](migrating-0.3.0-to-0.3.1.md)                        |
| `clientAssetsFromManifest` | value | documented      | [skills/gyral/references/ssr.md](../../skills/gyral/references/ssr.md)            |
| `componentsFromManifest`   | value | documented      | [skills/gyral/references/ssr.md](../../skills/gyral/references/ssr.md)            |
| `FetchApp`                 | type  | documented      | [migrating-0.3.0-to-0.3.1.md](migrating-0.3.0-to-0.3.1.md)                        |
| `ManifestChunk`            | type  | documented      | [design-docs/0016-production-builds.md](../design-docs/0016-production-builds.md) |
| `ManifestOptions`          | type  | supporting type |                                                                                   |
| `PageAssets`               | type  | supporting type |                                                                                   |
| `prerender`                | value | documented      | [skills/gyral/references/ssr.md](../../skills/gyral/references/ssr.md)            |
| `PrerenderedPage`          | type  | supporting type |                                                                                   |
| `PrerenderOptions`         | type  | supporting type |                                                                                   |
| `ProductionOptions`        | type  | supporting type |                                                                                   |
| `productionServer`         | value | documented      | [skills/gyral/references/ssr.md](../../skills/gyral/references/ssr.md)            |
| `RenderMode`               | type  | supporting type |                                                                                   |
| `ViteManifest`             | type  | supporting type |                                                                                   |

### `@gyral/ssr/node`

| Export                | Kind  | Status          | Documented in                                                          |
| --------------------- | ----- | --------------- | ---------------------------------------------------------------------- |
| `DevApp`              | type  | documented      | [skills/gyral/references/ssr.md](../../skills/gyral/references/ssr.md) |
| `DevServer`           | type  | supporting type |                                                                        |
| `DevServerContext`    | type  | supporting type |                                                                        |
| `DevServerOptions`    | type  | supporting type |                                                                        |
| `FetchHandler`        | type  | supporting type |                                                                        |
| `gyralDevServer`      | value | documented      | [skills/gyral/references/ssr.md](../../skills/gyral/references/ssr.md) |
| `NodeEnv`             | type  | documented      | [skills/gyral/references/ssr.md](../../skills/gyral/references/ssr.md) |
| `NodeListener`        | type  | supporting type |                                                                        |
| `NodeListenerOptions` | type  | supporting type |                                                                        |
| `toNodeListener`      | value | documented      | [skills/gyral/references/ssr.md](../../skills/gyral/references/ssr.md) |

### `@gyral/testing`

| Export                | Kind  | Status          | Documented in                                                                                |
| --------------------- | ----- | --------------- | -------------------------------------------------------------------------------------------- |
| `callsIn`             | value | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)               |
| `CollectedErrors`     | type  | supporting type |                                                                                              |
| `collectErrors`       | value | documented      | [skills/gyral/references/errors.md](../../skills/gyral/references/errors.md)                 |
| `commandsFor`         | value | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)               |
| `FakeCall`            | type  | supporting type |                                                                                              |
| `fakeDriver`          | value | documented      | [skills/gyral/references/outside-stores.md](../../skills/gyral/references/outside-stores.md) |
| `FakeDriver`          | type  | supporting type |                                                                                              |
| `FakeOptions`         | type  | supporting type |                                                                                              |
| `FakeRun`             | type  | supporting type |                                                                                              |
| `FocusTarget`         | type  | supporting type |                                                                                              |
| `focusTargetsIn`      | value | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)               |
| `hydrated`            | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                         |
| `HydratedOptions`     | type  | supporting type |                                                                                              |
| `initial`             | value | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)               |
| `inputsFor`           | value | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)               |
| `mount`               | value | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)               |
| `Mounted`             | type  | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)               |
| `MountedSsr`          | type  | supporting type |                                                                                              |
| `MountOptions`        | type  | supporting type |                                                                                              |
| `mountSsr`            | value | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)               |
| `MountSsrOptions`     | type  | supporting type |                                                                                              |
| `outputsIn`           | value | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)               |
| `parse`               | value | documented      | [skills/gyral/references/errors.md](../../skills/gyral/references/errors.md)                 |
| `ParseOptions`        | type  | supporting type |                                                                                              |
| `Ran`                 | type  | supporting type |                                                                                              |
| `readerOf`            | value | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)               |
| `reject`              | value | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)               |
| `resetDocumentStores` | value | documented      | [migrating-0.3.0-to-0.3.1.md](migrating-0.3.0-to-0.3.1.md)                                   |
| `resolve`             | value | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)               |
| `run`                 | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                         |
| `RunOptions`          | type  | supporting type |                                                                                              |
| `sentTo`              | value | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)               |
| `step`                | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                         |
| `StepMessage`         | type  | supporting type |                                                                                              |
| `Stepped`             | type  | supporting type |                                                                                              |
| `stepStore`           | value | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)               |
| `subscriptionsFor`    | value | documented      | [skills/gyral/references/outside-stores.md](../../skills/gyral/references/outside-stores.md) |
| `testStore`           | value | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)               |
| `virtualTime`         | value | documented      | [skills/gyral/references/testing.md](../../skills/gyral/references/testing.md)               |
| `VirtualTime`         | type  | supporting type |                                                                                              |
| `withDrivers`         | value | documented      | [skills/gyral/references/outside-stores.md](../../skills/gyral/references/outside-stores.md) |
| `WithOutputs`         | type  | supporting type |                                                                                              |

### `@gyral/testing/vitest`

| Export                | Kind  | Status          | Documented in                                        |
| --------------------- | ----- | --------------- | ---------------------------------------------------- |
| `renderOnServer`      | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md) |
| `ServerRenderRequest` | type  | supporting type |                                                      |

### `@gyral/time`

| Export       | Kind  | Status          | Documented in                                                                         |
| ------------ | ----- | --------------- | ------------------------------------------------------------------------------------- |
| `debounce`   | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                  |
| `delay`      | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                  |
| `every`      | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                  |
| `Frame`      | type  | supporting type |                                                                                       |
| `Lane`       | type  | documented      | [design-docs/0006-effects-and-drivers.md](../design-docs/0006-effects-and-drivers.md) |
| `time`       | value | documented      | [skills/gyral/SKILL.md](../../skills/gyral/SKILL.md)                                  |
| `TimeDriver` | type  | supporting type |                                                                                       |
| `TimeInput`  | type  | supporting type |                                                                                       |
| `TimeOutput` | type  | supporting type |                                                                                       |

<!-- inventory:end -->
