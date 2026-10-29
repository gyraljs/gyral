---
'@gyral/core': patch
---

**Behavior change:** a component renders only when its state, a declared prop or a declared
store's value changes (gyral-337.1). A message whose `update` returns the same state no longer
runs the view; that render wrote nothing anyway. A view that reads anything else (`Date.now()`,
a module variable, the DOM) stops refreshing on unrelated messages: move that into state, a
prop or a store. Development re-runs skipped views and warns once per component when one
renders differently (G0017).

`each(items, key, row, { pick, equals })` compares picked values with `equals`, and
`subscription(…, { select, equals, coalesce })` maps each value, drops repeats, or delivers
only the latest per microtask or animation frame.
