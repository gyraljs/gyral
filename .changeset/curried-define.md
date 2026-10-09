---
'@gyral/core': patch
'@gyral/devtools': patch
'create-gyral': patch
'@gyral/mcp': patch
---

`define` takes two calls, the types first and then the tag and spec:
`define<State, Msg>()('my-tag', { … })`. The second call infers the component's intent names
from the keys of `intent`. A key that is a message tag must return that variant; any other key
is an intent of its own whose parser may return any message and needs no reducer, so several
controls that each parse into the same message need no variant or pass-through reducer apiece.
The view's `i` offers exactly those names, and list rows get them with
`intentsOf<typeof Component>()` (give such a row a return type, `TemplateResult`).
`define()('my-tag', spec)` with no type arguments infers everything, as before. The extra
call costs about 10 B gzip per app.

Behavior change: the one-call `define(tag, spec)`, `intents<Msg>()`, `IntentName<…>` and
`Messages<M>` are removed, `IntentNames` takes the names instead of the message union, and a
view that names a tag with no parser no longer compiles. Write `define<State, Msg>()(tag,
spec)`, replace `intents<Msg>()` with `intentsOf<typeof C>()`, and drop `IntentName<…>` from
message unions (docs/references/migrating-0.3.0-to-0.3.1.md, ADR 0023).
