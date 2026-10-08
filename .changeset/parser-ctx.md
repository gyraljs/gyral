---
'@gyral/core': patch
---

Intent parsers get the read-only context reducers get as a second argument: `(input, ctx)`, with
`ctx.props` as they are when the event fires and `ctx.read(store)`. A parser can now decide from
props whether to call `preventDefault()`, synchronously. One-parameter parsers keep working;
`IntentParser<M, P>` takes the props type as an optional second parameter, and `form()`,
`field()` and `child()` return one-parameter parsers, so calling them directly still compiles.
