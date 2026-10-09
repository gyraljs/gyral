---
'@gyral/core': patch
'@gyral/testing': patch
---

Intent parsers can read the component's state: the second argument is now
`{ props, state, read }` (`ParserCtx<P, S>`), with `state` as it is when the event fires,
read-only. Where the user is often decides `preventDefault()` (a grid keeps Tab until its last
cell), and views no longer need to write attributes just so a parser can read them.

Behavior change: `IntentParser` takes a third type parameter for the state, and code that
builds a parser context by hand (calling a parser directly in a test) must add `state`.
