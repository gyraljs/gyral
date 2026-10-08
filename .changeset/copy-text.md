---
'@gyral/core': patch
---

New command `copyText(text, { onSuccess?, onFailure? })` puts text on the clipboard with
`navigator.clipboard.writeText`. Failures are a typed `ClipboardError` whose `reason` is
`unavailable` (no Clipboard API, not a secure context), `denied` (no user activation, or a
permission refused) or `failed`. Its driver is named `clipboard`, so tests substitute it by
name. Apps that don't use it don't bundle it.
