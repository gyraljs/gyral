---
'@gyral/core': patch
---

`gyral/prefer-built-in` (gyral-337.4), a new `@gyral/core/eslint` rule, warns in the recommended
config about hand-written versions of what Gyral has built in, each message naming the built-in:
a dialog opened with `showModal()` (`?modal`), `.focus()` in a driver (the `focus()` command),
`JSON.parse` of an attribute or prop (`prop.json()`), a subscription that drops repeats by hand
(`equals`), a record of drivers outside tests (a list), and intent parsers that check the event's
type, modifier keys, `Number(value)` or `composedPath()[0]` (`on()`). `gyral/intent-event` now
reads every event of a quoted `data-intent-on="keydown keyup"`, not only the first.
