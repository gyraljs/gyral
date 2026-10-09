---
'@gyral/core': patch
---

The error fallback view (`spec.error`) and the `Errored` message register like spec-field
features: with the Vite preset, the fallback is bundled only when a module names `error` and the
`Errored` dispatch only when one names `Errored`, saving about 80-100 B gzip in apps that name
neither. The reporting channel (`GyralError`, the boundary event, `reportError`) stays in every
app. Without a build step everything is present, as before.
