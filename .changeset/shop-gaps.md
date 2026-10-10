---
'@gyral/core': patch
'@gyral/ssr': patch
'@gyral/time': patch
---

Fixes found while moving a real app to 0.3.1-next.7:

- `defineForm(schema, { secret })` accepts any posted field name, not only schema keys, and
  fields named like `csrf`/`xsrf` are never echoed (like `password`/`passcode`).
- The error view and `Errored` are bundled only for an `error` key in a `define()` spec (or a
  function-valued `error` key elsewhere) or the `Errored` name; a state field called `error` no
  longer pulls them in. Behavior change: an error view written as a non-function value in a spec
  built in another module isn't detected; write it as a function in the spec.
- Subscription inputs compare as data: functions inside them are ignored, so an inline selector
  doesn't restart the lane after every message (it used to, until G0080 stopped it). Behavior
  change: to restart on a new selector, change the key.
- The component loader also finds tags rendered in the shadow roots of components it defined, and
  `componentsReady()` waits until every rendered tag it knows is defined and the page settled.
- The diagnostics table ships as `@gyral/core/errors.json`.
- The generated `.gyral/elements.d.ts` starts with `/* eslint-disable */`.
