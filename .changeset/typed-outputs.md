---
'@gyral/core': patch
---

Typed outputs and a public output event. `outputs<Out>()` returns `emit` typed by a component's
output union (`const emit = outputs<Out>()`, like `intents<Msg>()`), so an output of the wrong
shape fails to compile in the child; it is `emit` itself, with no run-time cost, and it accepts
outputs declared as interfaces. `OUTPUT_EVENT` (`'gyral-output'`) is exported with the types
`OutputEvent<O>` and `OutputsOf<typeof Child>`, so a parent that isn't a Gyral component (plain
DOM, Lit, another library) can listen to a Gyral child's outputs.
