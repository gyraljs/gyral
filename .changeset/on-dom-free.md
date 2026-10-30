---
'@gyral/core': patch
'@gyral/testing': patch
---

`parse()` from `@gyral/testing` now runs `on()` parsers without a DOM, so a Node test
(Vitest's `node` environment) can test them (gyral-cd0). Before, `parse(C, 'Key', { key: 'Enter' })`
on an `on('keydown', { keys: ['Enter'] }, …)` parser threw (G0018 for its `intent` event,
`HTMLInputElement is not defined`, or a `TypeError` on the missing target) or quietly returned
`undefined`. Now:

- the event `parse()` creates has the type the `on()` parser declares and carries `key`;
- the new `modifiers` field names the keys held: `parse(C, 'Save', { key: 's', modifiers: { ctrl: true } })`.
  It applies only to that event: with an `event` of your own, set `ctrlKey` and the rest on it
  (`parse()` throws when it gets both);
- `on()`'s key filter reads the input's `key` before `event.key`;
- with no target, `valueAsNumber` reads `value`, and `control`, `form` and `origin` are `undefined`.
  DOM classes are feature-detected, and an event without `composedPath()` is accepted.

In the browser, `on()` behaves as before.
