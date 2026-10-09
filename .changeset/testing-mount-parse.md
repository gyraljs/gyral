---
'@gyral/testing': patch
---

`mount(Component | 'tag', { props, attrs, drivers, stores, light?, parent? })` puts a component
in the document for a browser test: drivers and stores are set before it connects, props
before its first render, and it resolves after the first render with `{ el, $, $$, type,
click, settled, dispose }`. Queries reach into the shadow root, `type()` and `click()` wait for
the result, and mounted elements are removed after each test when the runner has a global
`afterEach`. `parse(Component, 'Intent', input, { props, state, stores })` runs one intent
parser without a DOM or casts, typed by the parser.
