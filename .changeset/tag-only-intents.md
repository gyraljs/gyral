---
'@gyral/core': patch
'@gyral/testing': patch
---

A message that carries only its tag needs no parser: `intent: { Next: true }` sends
`{ _tag: 'Next' }`. The types allow `true` only for a message tag whose variant has no other
field. `intent` is optional, and `update` is optional for a component with no messages
(`define<State>()(tag, { init, view })`); with messages, `update` stays required and exhaustive.
`step()` and `run()` accept specs without `update`. Existing code keeps working.
