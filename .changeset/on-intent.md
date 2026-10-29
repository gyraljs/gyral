---
'@gyral/core': patch
---

`on(event, [filter], parser)` (gyral-337.6): an intent parser typed by its event (`keydown`
gives a `KeyboardEvent`), whose input adds `control`, `form`, `modifiers`, `files`,
`valueAsNumber` and `origin`. A key filter (`keys`, `modifiers`) declines other keys, which pass
outward with their default action. Development throws G0018 when another event reaches an
`on()` parser, and the new `gyral/intent-event` ESLint rule (an error in the recommended
config) finds such a binding in the editor. A module of its own: apps that don't call it don't
bundle it.
