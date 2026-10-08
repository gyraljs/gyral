---
'@gyral/core': patch
---

Intent names may be declared in the message union with `IntentName<…>`:
`type Msg = Send | IntentName<'Archive' | 'Restore'>`. Each declared name is a required `intent`
key whose parser may return any message; it appears in the view's `i` and in `intents<Msg>()`
and needs no reducer. Several controls that each parse into the same message no longer need a
message variant and a pass-through reducer apiece. `Messages<Msg>` is the union without its
intent names, for helpers that build messages. Types only: existing components are unchanged
and bundles don't grow.
