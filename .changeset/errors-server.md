---
'@gyral/ssr': patch
'@gyral/core': patch
---

A component that throws on the server (ADR 0024) renders its `error` view (or nothing), marked
`data-gyral-error` and without a seed, and the page goes on; the browser starts that component
fresh. `renderPage`, `renderToStream` and `renderToString` take `onError(error)` (default
`console.error`); `onError: 'throw'` renders the page to a string first and throws before any
byte is sent, so the route can answer with an error page. Core's server `render` and
`renderToString` take the same `onError` function.

Behavior change: a component failure no longer ends the response with a truncated body; pass
`onError: 'throw'` to fail the whole render instead.
