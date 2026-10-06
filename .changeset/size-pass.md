---
'@gyral/core': minor
---

Smaller bundles (size pass, ADR 0018): code an app doesn't use is no longer bundled. The keyed
list reconciler comes with `each`, `raw` with `raw`, the command interpreter with `command()`,
the store binding with `defineStore()` and prop parsing with the prop builders. Hydration and
islands load lazily, with the first server-rendered host, so client-only pages never fetch them;
the invoker-command fallback loads only where `CommandEvent` is missing. A component root now
listens only for the events its templates can fire intents on (any statically named
`data-intent-on` type works without `spec.events`). New: `intents<Msg>()`, a module-level
constant of intent names for pure `each` rows.
