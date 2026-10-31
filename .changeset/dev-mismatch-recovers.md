---
'@gyral/core': patch
---

In development, a hydration mismatch no longer leaves the component dead (gyral-uvj.3). A
component whose server-rendered DOM doesn't match its first client render is now rendered
fresh in development too, exactly as production builds already did, and responds to intents.
Development logs the mismatch with `console.error` in full (G0062: the component, the
template's call site, the DOM path, what was expected and what was found), then G0063.

Before, development threw the mismatch: the component kept the server's DOM, no render updated
it, and every render tried to hydrate again. A mismatch Gyral itself caused (a `<noscript>`
notice, fixed in this release) left a component you couldn't fix from your code. The mismatch
was also reported as a view failure (G0031): the component's `error` view rendered, and
`window` `error` listeners and `collectErrors()` saw it. It no longer goes through the error
channel in either build; look for the console error instead. `hydrated()` from
`@gyral/testing` still fails a test on it, now quoting the mismatch itself. Production is
unchanged.
