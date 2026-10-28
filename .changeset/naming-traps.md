---
'@gyral/core': patch
---

Catch two names the platform resolved silently (gyral-k97.5).

- **New template error, rule 16:** an attribute name with capitals on a custom element,
  `<pool-card playerBase=${n}>`. HTML lowercases it to `playerbase`, and a prop `playerBase`
  reads `player-base`, so the value was lost. Write `player-base=${n}`, or bind the property,
  `.playerBase=${n}`. `vite build` with the preset and ESLint (`gyral/template`) report it, and
  the runtime in development. An `attribute: 'playerbase'` override keeps working; write the
  attribute in lower case in templates. Built-in HTML elements and SVG content are not checked.
- **Reserved prop names:** a prop named `state`, `send`, `drivers`, `stores`, `initialMessages`
  or a custom-element callback replaced the element's own member (a prop `state` hid the
  model). It is now a development error (G0023, as built-in names already were) and a type
  error in `define()`, as are built-in names such as `hidden`. Rename the property and keep the
  attribute: `badge: prop.string({ attribute: 'state' })`.
- **Development warning G0024:** a host whose page HTML (or host framework) gave it the
  lowercased name of a camelCase prop, such as `playerbase` for `playerBase`, warns once at its
  first connect.
